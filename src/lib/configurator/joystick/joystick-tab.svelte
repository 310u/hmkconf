<script lang="ts">
  import { Button } from "$lib/components/ui/button"
  import * as Select from "$lib/components/ui/select"
  import { Slider } from "$lib/components/ui/slider"
  import { keyboardContext, type Keyboard } from "$lib/keyboard"
  import type { HMK_Options } from "$lib/libhmk"
  import {
    HMK_JOYSTICK_MOUSE_PRESET_FIRMWARE_VERSION,
    type HMK_JoystickConfig,
    type HMK_JoystickMousePreset,
    type HMK_JoystickState,
  } from "$lib/libhmk/commands/joystick"
  import { cn, displayVersion, type WithoutChildren } from "$lib/utils"
  import { untrack } from "svelte"
  import { toast } from "svelte-sonner"
  import type { HTMLAttributes } from "svelte/elements"
  import { globalStateContext } from "../context.svelte"
  import JoystickDiagnosticPlot from "./joystick-diagnostic-plot.svelte"
  import {
    assessJoystickRestSamples,
    applyJoystickCircularCorrection,
    applyJoystickRadialDeadzone,
    buildCalibrationCandidate,
    buildJoystickDiagnosticSample,
    computeJoystickCircularity,
    normalizeRawPoint,
    optimizeCalibrationCandidate,
    predictLinuxJoydevGamepadPoint,
    pushBoundedSample,
    type JoystickCalibrationCandidate,
    type JoystickDiagnosticRawSample,
    type JoystickDiagnosticSample,
    type JoystickVector,
  } from "./joystick-diagnostics"

  const JOYSTICK_STATE_POLL_INTERVAL = 1000 / 60
  const LIVE_SAMPLE_LIMIT = 360
  const SWEEP_SAMPLE_LIMIT = 720
  const FRESH_CAPTURE_MAX_SAMPLES = 300
  const FRESH_CAPTURE_START_THRESHOLD = 24
  const DIAGNOSTIC_EXPORT_POINT_LIMIT = 60
  const HOST_GAMEPAD_ACTIVE_THRESHOLD = 8
  const HOST_GAMEPAD_AXIS_SPAN_THRESHOLD = 0.35
  const HOST_GAMEPAD_AXIS_BIPOLAR_THRESHOLD = 0.2
  const HOST_GAMEPAD_AXIS_PAIR_SCORE_THRESHOLD = 0.8
  const LINUX_JOYDEV_PREDICTION_ASSUMPTION =
    "Default Linux joydev correction without a jscal override."
  const LINUX_JOYDEV_PREDICTION_ROLE =
    "Reference only for the default Linux joydev path. Ignores jscal overrides; measured host capture is authoritative when available."

  const {
    class: className,
    ...props
  }: WithoutChildren<HTMLAttributes<HTMLDivElement>> = $props()

  const keyboard = keyboardContext.get() as Keyboard
  const { profile, tab } = $derived(globalStateContext.get())

  let config = $state<HMK_JoystickConfig | null>(null)
  let runtimeProfileConfig = $state<HMK_JoystickConfig | null>(null)
  let runtimeProfileConfigProfile = $state<number | null>(null)
  let runtimeProfileConfigPending = $state<number | null>(null)
  let options = $state<HMK_Options | null>(null)
  let joystickState = $state<HMK_JoystickState | null>(null)
  let loading = $state(true)

  let calibrationPhase = $state<"idle" | "rest" | "max">("idle")
  let calibrationPreviousMode = $state<number | null>(null)
  let configReadbackVerified = $state<boolean | null>(null)
  let liveSamples = $state<JoystickDiagnosticSample[]>([])
  let freshCapturePhase = $state<"idle" | "armed" | "capturing" | "complete">(
    "idle",
  )
  let freshLiveSamples = $state<JoystickDiagnosticSample[]>([])
  let freshHostGamepadSamples = $state<JoystickVector[]>([])
  let hostGamepadSamples = $state<JoystickVector[]>([])
  let hostGamepadAxesHistory = $state<number[][]>([])
  let hostGamepadAxesSourceKey = $state<string | null>(null)
  let hostGamepadSampleSourceKey = $state<string | null>(null)
  let sweepRawSamples = $state<JoystickDiagnosticRawSample[]>([])
  let lastSweepRawSamples = $state<JoystickDiagnosticRawSample[]>([])
  let lastSweepCalibration = $state<JoystickCalibrationCandidate | null>(null)
  type HostGamepadCandidate = {
    index: number
    id: string
    mapping: string
    axes: number
    buttons: number
    sampledStick: "left" | "right" | null
    axisPair: [number, number] | null
    rawAxes: number[]
    vector: JoystickVector | null
    magnitude: number
    active: boolean
    selected: boolean
  }
  let hostGamepadState = $state<{
    available: boolean
    connected: boolean
    index: number | null
    id: string | null
    mapping: string | null
    sampledStick: "left" | "right" | null
    axisPair: [number, number] | null
    rawAxes: number[]
    vector: JoystickVector | null
    magnitude: number
    candidates: HostGamepadCandidate[]
  }>({
    available: false,
    connected: false,
    index: null,
    id: null,
    mapping: null,
    sampledStick: null,
    axisPair: null,
    rawAxes: [],
    vector: null,
    magnitude: 0,
    candidates: [],
  })

  type CircularityReport = ReturnType<typeof computeJoystickCircularity>

  $effect(() => {
    if (tab !== "joystick") return

    loading = true
    options = null
    liveSamples = []
    freshCapturePhase = "idle"
    freshLiveSamples = []
    freshHostGamepadSamples = []
    hostGamepadSamples = []
    hostGamepadAxesHistory = []
    hostGamepadAxesSourceKey = null
    hostGamepadSampleSourceKey = null
    sweepRawSamples = []
    lastSweepRawSamples = []
    lastSweepCalibration = null
    runtimeProfileConfig = null
    runtimeProfileConfigProfile = null
    runtimeProfileConfigPending = null
    configReadbackVerified = null
    hostGamepadState = {
      available: typeof navigator !== "undefined" && !!navigator.getGamepads,
      connected: false,
      index: null,
      id: null,
      mapping: null,
      sampledStick: null,
      axisPair: null,
      rawAxes: [],
      vector: null,
      magnitude: 0,
      candidates: [],
    }
    let active = true
    let pollTimeout: number | null = null
    let joystickPollInFlight = false

    keyboard
      .getJoystickConfig?.({ profile })
      .then((c) => {
        if (!active) return
        config = c
      })
      .catch(() => {
        // ignore disconnects
      })
      .finally(() => {
        if (active) loading = false
      })

    keyboard
      .getOptions()
      .then((currentOptions) => {
        if (!active) return
        options = currentOptions
      })
      .catch(() => {
        // ignore disconnects
      })

    async function pollState() {
      if (!active) return

      if (joystickPollInFlight) {
        pollTimeout = window.setTimeout(pollState, JOYSTICK_STATE_POLL_INTERVAL)
        return
      }

      joystickPollInFlight = true
      try {
        if (keyboard.getJoystickState) {
          joystickState = await keyboard.getJoystickState()
        }
        pollHostGamepad()
      } catch {
        // ignore disconnects
      } finally {
        joystickPollInFlight = false
      }

      if (active) {
        pollTimeout = window.setTimeout(pollState, JOYSTICK_STATE_POLL_INTERVAL)
      }
    }

    pollState()

    return () => {
      active = false
      if (pollTimeout !== null) {
        clearTimeout(pollTimeout)
      }
    }
  })

  $effect(() => {
    if (tab !== "joystick" || !keyboard.getJoystickConfig) return

    const runtimeProfile = joystickState?.profile ?? null
    if (runtimeProfile === null || runtimeProfile === profile) {
      runtimeProfileConfig = null
      runtimeProfileConfigProfile = null
      runtimeProfileConfigPending = null
      return
    }

    if (
      runtimeProfileConfigProfile === runtimeProfile &&
      runtimeProfileConfig !== null
    ) {
      return
    }

    if (runtimeProfileConfigPending === runtimeProfile) {
      return
    }

    runtimeProfileConfigPending = runtimeProfile
    let cancelled = false

    keyboard
      .getJoystickConfig({ profile: runtimeProfile })
      .then((runtimeConfig) => {
        if (cancelled) return
        runtimeProfileConfig = runtimeConfig
        runtimeProfileConfigProfile = runtimeProfile
      })
      .catch(() => {
        if (cancelled) return
        runtimeProfileConfig = null
        runtimeProfileConfigProfile = null
      })
      .finally(() => {
        if (cancelled) return
        if (runtimeProfileConfigPending === runtimeProfile) {
          runtimeProfileConfigPending = null
        }
      })

    return () => {
      cancelled = true
    }
  })

  $effect(() => {
    if (!joystickState || !config) return

    const diagnosticConfig =
      joystickState.profile !== profile &&
      runtimeProfileConfigProfile === joystickState.profile &&
      runtimeProfileConfig
        ? runtimeProfileConfig
        : config

    if (!diagnosticConfig) return

    const sample = buildJoystickDiagnosticSample(joystickState, diagnosticConfig)

    liveSamples = pushBoundedSample(
      untrack(() => liveSamples),
      sample,
      LIVE_SAMPLE_LIMIT,
    )

    updateFreshCapture(sample)

    if (calibrationPhase === "max") {
      sweepRawSamples = pushBoundedSample(
        untrack(() => sweepRawSamples),
        { x: joystickState.rawX, y: joystickState.rawY },
        SWEEP_SAMPLE_LIMIT,
      )
    }
  })

  $effect(() => {
    const currentAxesSourceKey =
      hostGamepadState.index !== null ? String(hostGamepadState.index) : null
    if (currentAxesSourceKey === hostGamepadAxesSourceKey) return

    hostGamepadAxesSourceKey = currentAxesSourceKey
    hostGamepadAxesHistory = []
  })

  $effect(() => {
    if (hostGamepadState.rawAxes.length === 0) return

    hostGamepadAxesHistory = pushBoundedSample(
      untrack(() => hostGamepadAxesHistory),
      hostGamepadState.rawAxes,
      LIVE_SAMPLE_LIMIT,
    )
  })

  $effect(() => {
    const currentSourceKey =
      hostGamepadState.index !== null && hostGamepadState.sampledStick
        ? `${hostGamepadState.index}:${hostGamepadState.sampledStick}:${
            hostGamepadState.axisPair?.join(",") ?? "na"
          }`
        : null
    if (currentSourceKey === hostGamepadSampleSourceKey) return

    hostGamepadSampleSourceKey = currentSourceKey
    hostGamepadSamples = []
  })

  $effect(() => {
    if (!hostGamepadState.vector) return

    hostGamepadSamples = pushBoundedSample(
      untrack(() => hostGamepadSamples),
      hostGamepadState.vector,
      LIVE_SAMPLE_LIMIT,
    )

    if (freshCapturePhase !== "capturing") return

    freshHostGamepadSamples = pushBoundedSample(
      untrack(() => freshHostGamepadSamples),
      hostGamepadState.vector,
      FRESH_CAPTURE_MAX_SAMPLES,
    )
  })

  async function updateConfig(newConfig: Partial<HMK_JoystickConfig>) {
    if (!config) return
    const updated = { ...config, ...newConfig }
    await persistJoystickConfig(updated)
  }

  async function updateConfigWithToast(
    newConfig: Partial<HMK_JoystickConfig>,
    message: string,
  ) {
    try {
      await updateConfig(newConfig)
      return true
    } catch (error) {
      toast.error(message)
      console.error(error)
      return false
    }
  }

  const modes = [
    { value: "0", label: "Disabled" },
    { value: "1", label: "Mouse" },
    { value: "2", label: "XInput Left Stick" },
    { value: "3", label: "XInput Right Stick" },
    { value: "4", label: "Scroll" },
    { value: "5", label: "Cursor 4-way" },
    { value: "6", label: "Cursor 8-way" },
  ]

  const supportsJoystickMousePresets = $derived.by(
    () => keyboard.version >= HMK_JOYSTICK_MOUSE_PRESET_FIRMWARE_VERSION,
  )

  // Calibration logic
  // We collect samples to find min/max and center
  let centerSamplesX = $state<number[]>([])
  let centerSamplesY = $state<number[]>([])
  let minX = $state(4095)
  let maxX = $state(0)
  let minY = $state(4095)
  let maxY = $state(0)

  const liveRawPoints = $derived.by(() =>
    liveSamples.map((sample) => sample.raw),
  )
  const liveOutPoints = $derived.by(() =>
    liveSamples.map((sample) => sample.out),
  )
  const diagnosticConfig = $derived.by(() => {
    if (
      joystickState &&
      joystickState.profile !== profile &&
      runtimeProfileConfigProfile === joystickState.profile &&
      runtimeProfileConfig
    ) {
      return runtimeProfileConfig
    }

    return config
  })
  const diagnosticProfile = $derived.by(() => {
    if (
      joystickState &&
      joystickState.profile !== profile &&
      runtimeProfileConfigProfile === joystickState.profile &&
      runtimeProfileConfig
    ) {
      return joystickState.profile
    }

    return profile
  })
  function predictFirmwareOutput(point: JoystickVector): JoystickVector {
    if (!diagnosticConfig) {
      return { x: 0, y: 0 }
    }

    return applyJoystickRadialDeadzone(
      applyJoystickCircularCorrection(point, diagnosticConfig.radialBoundaries),
      diagnosticConfig.deadzone,
    )
  }
  const liveReferenceOutPoints = $derived.by(() =>
    diagnosticConfig ? liveRawPoints.map((point) => predictFirmwareOutput(point)) : [],
  )
  const livePredictedLinuxHostPoints = $derived.by(() =>
    liveReferenceOutPoints.map((point) => predictLinuxJoydevGamepadPoint(point)),
  )
  const freshRawPoints = $derived.by(() =>
    freshLiveSamples.map((sample) => sample.raw),
  )
  const freshCalibratedPoints = $derived.by(() =>
    freshLiveSamples.flatMap((sample) =>
      sample.calibrated ? [sample.calibrated] : [],
    ),
  )
  const freshCorrectedPoints = $derived.by(() =>
    freshLiveSamples.flatMap((sample) => (sample.corrected ? [sample.corrected] : [])),
  )
  const freshOutPoints = $derived.by(() =>
    freshLiveSamples.map((sample) => sample.out),
  )
  const freshReferenceOutPoints = $derived.by(() =>
    diagnosticConfig ? freshRawPoints.map((point) => predictFirmwareOutput(point)) : [],
  )
  const freshPredictedLinuxHostPoints = $derived.by(() =>
    freshReferenceOutPoints.map((point) => predictLinuxJoydevGamepadPoint(point)),
  )
  const freshHostPoints = $derived.by(() => freshHostGamepadSamples)
  const hostGamepadPoints = $derived.by(() => hostGamepadSamples)
  const detectedHostGamepadAxisPair = $derived.by(() =>
    detectHostGamepadAxisPair(hostGamepadAxesHistory),
  )
  const liveRawCircularity = $derived.by(() =>
    computeJoystickCircularity(liveRawPoints),
  )
  const liveCalibratedPoints = $derived.by(() =>
    liveSamples.flatMap((sample) => (sample.calibrated ? [sample.calibrated] : [])),
  )
  const liveCorrectedPoints = $derived.by(() =>
    liveSamples.flatMap((sample) => (sample.corrected ? [sample.corrected] : [])),
  )
  const liveCalibratedCircularity = $derived.by(() =>
    computeJoystickCircularity(liveCalibratedPoints),
  )
  const liveCorrectedCircularity = $derived.by(() =>
    computeJoystickCircularity(liveCorrectedPoints),
  )
  const liveOutCircularity = $derived.by(() =>
    computeJoystickCircularity(liveOutPoints),
  )
  const liveReferenceOutCircularity = $derived.by(() =>
    computeJoystickCircularity(liveReferenceOutPoints),
  )
  const livePredictedLinuxHostCircularity = $derived.by(() =>
    computeJoystickCircularity(livePredictedLinuxHostPoints),
  )
  const freshRawCircularity = $derived.by(() =>
    computeJoystickCircularity(freshRawPoints),
  )
  const freshCalibratedCircularity = $derived.by(() =>
    computeJoystickCircularity(freshCalibratedPoints),
  )
  const freshCorrectedCircularity = $derived.by(() =>
    computeJoystickCircularity(freshCorrectedPoints),
  )
  const freshOutCircularity = $derived.by(() =>
    computeJoystickCircularity(freshOutPoints),
  )
  const freshReferenceOutCircularity = $derived.by(() =>
    computeJoystickCircularity(freshReferenceOutPoints),
  )
  const freshPredictedLinuxHostCircularity = $derived.by(() =>
    computeJoystickCircularity(freshPredictedLinuxHostPoints),
  )
  const currentReferenceOut = $derived.by(() => {
    if (!joystickState || !diagnosticConfig) return null

    return predictFirmwareOutput(
      normalizeRawPoint(
        { x: joystickState.rawX, y: joystickState.rawY },
        diagnosticConfig,
      ),
    )
  })
  const restAssessment = $derived.by(() =>
    assessJoystickRestSamples(centerSamplesX, centerSamplesY),
  )
  const freshHostCircularity = $derived.by(() =>
    computeJoystickCircularity(freshHostPoints),
  )
  const hostGamepadCircularity = $derived.by(() =>
    computeJoystickCircularity(hostGamepadPoints),
  )
  const sweepCalibration = $derived.by(() =>
    buildCalibrationCandidate(
      centerSamplesX,
      centerSamplesY,
      minX,
      maxX,
      minY,
      maxY,
      sweepRawSamples,
    ),
  )
  const displayedSweepCalibration = $derived.by(
    () =>
      (calibrationPhase === "max" ? sweepCalibration : lastSweepCalibration) ??
      null,
  )
  const displayedSweepRawSamples = $derived.by(() =>
    calibrationPhase === "max" ? sweepRawSamples : lastSweepRawSamples,
  )
  const displayedSweepPoints = $derived.by(() => {
    if (!displayedSweepCalibration) return []

    return displayedSweepRawSamples.map((sample) =>
      applyJoystickCircularCorrection(
        normalizeRawPoint(sample, displayedSweepCalibration),
        displayedSweepCalibration.radialBoundaries,
      ),
    )
  })
  const displayedSweepOutputPoints = $derived.by(() => {
    if (!config) return []
    const deadzone = config.deadzone

    return displayedSweepPoints.map((point) =>
      applyJoystickRadialDeadzone(point, deadzone),
    )
  })
  const sweepCircularity = $derived.by(() =>
    computeJoystickCircularity(displayedSweepPoints),
  )
  const sweepOutputCircularity = $derived.by(() =>
    computeJoystickCircularity(displayedSweepOutputPoints),
  )
  const isLinuxHost = $derived.by(() => {
    if (typeof navigator === "undefined") return false
    return /Linux/i.test(navigator.userAgent)
  })
  const hostGamepadBackend = $derived.by(() => {
    if (typeof navigator === "undefined" || !navigator.getGamepads) {
      return "Gamepad API unavailable"
    }

    if (isLinuxHost) {
      return "Chromium Gamepad API via Linux joydev"
    }

    return "Browser Gamepad API"
  })
  const currentGamepadTransport = $derived.by(() => {
    if (!options) return "Unknown"
    return options.xInputEnabled ? "XInput" : "HID Gamepad"
  })
  const supportsHostTransportComparison = $derived.by(() => {
    if (typeof navigator === "undefined") return false
    return !isLinuxHost
  })
  const gamepadHostValidationMode = $derived.by(() => {
    if (!config)
      return "Switch the joystick mode to XInput Left Stick or XInput Right Stick before host-side gamepad checks."
    if (!supportsHostTransportComparison) {
      if (config.mode === 2 || config.mode === 3) {
        return "On Linux, browser host checks read the Gamepad API through joydev. Use firmware OUT to validate the correction path, then treat the measured host capture as the real browser-side result. The Linux prediction shown below is only the default joydev baseline."
      }
      return "Switch the joystick mode to XInput Left Stick or XInput Right Stick before Linux browser host-side gamepad checks."
    }
    if (config.mode === 2 || config.mode === 3) {
      return "The joystick mode is already mapped to a gamepad stick, so host-side transport checks are ready."
    }
    return "Switch the joystick mode to XInput Left Stick or XInput Right Stick before host-side gamepad checks."
  })
  const transportValidationAdvice = $derived.by(() => {
    if (!supportsHostTransportComparison) {
      return "On Linux, Chromium/Electron reads Gamepad API axes through joydev instead of raw evdev/HID samples. Use firmware OUT to validate the correction path, then use measured host capture as the actual Linux browser result. The predicted Linux score is only a default-joydev reference."
    }

    return "After the shape is stable here, compare host behavior twice for gamepad use: once with XInput enabled, and once with XInput disabled."
  })
  const hostGamepadStatus = $derived.by(() => {
    if (!hostGamepadState.available) {
      return "Gamepad API is not available in this environment."
    }
    if (hostGamepadState.candidates.length === 0) {
      return "No host gamepad is currently detected. Disconnect other controllers if needed."
    }
    if (!hostGamepadState.sampledStick) {
      return "A host gamepad is connected, but the joystick mode is not set to a gamepad stick."
    }
    if (!hostGamepadState.axisPair) {
      return `Detected ${hostGamepadState.candidates.length} host gamepad(s), but the ${hostGamepadState.sampledStick} stick axis pair is still being inferred.`
    }
    if (hostGamepadState.magnitude < HOST_GAMEPAD_ACTIVE_THRESHOLD) {
      return `Detected ${hostGamepadState.candidates.length} host gamepad(s), but no activity was seen on the sampled ${hostGamepadState.sampledStick} stick yet.`
    }
    return `Sampling axes ${hostGamepadState.axisPair[0]}/${hostGamepadState.axisPair[1]} as the ${hostGamepadState.sampledStick} stick from host gamepad #${hostGamepadState.index}.`
  })
  const freshCaptureStatus = $derived.by(() => {
    if (freshCapturePhase === "armed") {
      return "Fresh capture is armed. Move the joystick to begin sampling."
    }
    if (freshCapturePhase === "capturing") {
      return `Capturing a fresh sweep: ${freshLiveSamples.length} samples recorded.`
    }
    if (freshCapturePhase === "complete") {
      return `Fresh capture complete with ${freshLiveSamples.length} joystick samples.`
    }
    return "No fresh sweep captured yet."
  })
  const hostCircularitySubtitle = $derived.by(() => {
    if (!supportsHostTransportComparison) {
      return "Measured Linux browser host result. Use this as the authoritative host-side score when it is available."
    }

    return "Confirms whether HID and XInput look different on the host."
  })
  const freshHostSubtitle = $derived.by(() => {
    if (!supportsHostTransportComparison) {
      return "Measured Linux browser host score over the same fixed capture window."
    }

    return "Host score over the same fixed capture window."
  })
  const liveLinuxMeasuredVsOutDelta = $derived.by(() =>
    circularityScoreDelta(hostGamepadCircularity, liveReferenceOutCircularity),
  )
  const liveLinuxMeasuredVsPredictionDelta = $derived.by(() =>
    circularityScoreDelta(
      hostGamepadCircularity,
      livePredictedLinuxHostCircularity,
    ),
  )
  const freshLinuxMeasuredVsOutDelta = $derived.by(() =>
    circularityScoreDelta(freshHostCircularity, freshReferenceOutCircularity),
  )
  const freshLinuxMeasuredVsPredictionDelta = $derived.by(() =>
    circularityScoreDelta(
      freshHostCircularity,
      freshPredictedLinuxHostCircularity,
    ),
  )
  const liveLinuxHostInterpretation = $derived.by(() =>
    describeLinuxHostPrediction(
      hostGamepadCircularity,
      liveReferenceOutCircularity,
      livePredictedLinuxHostCircularity,
    ),
  )
  const freshLinuxHostInterpretation = $derived.by(() =>
    describeLinuxHostPrediction(
      freshHostCircularity,
      freshReferenceOutCircularity,
      freshPredictedLinuxHostCircularity,
    ),
  )

  $effect(() => {
    if (!joystickState) return

    if (calibrationPhase === "rest") {
      centerSamplesX = [...untrack(() => centerSamplesX), joystickState.rawX]
      centerSamplesY = [...untrack(() => centerSamplesY), joystickState.rawY]
    } else if (calibrationPhase === "max") {
      minX = Math.min(
        untrack(() => minX),
        joystickState.rawX,
      )
      maxX = Math.max(
        untrack(() => maxX),
        joystickState.rawX,
      )
      minY = Math.min(
        untrack(() => minY),
        joystickState.rawY,
      )
      maxY = Math.max(
        untrack(() => maxY),
        joystickState.rawY,
      )
    }
  })

  async function startCalibration() {
    if (!config) return

    liveSamples = []
    clearFreshCapture()
    centerSamplesX = []
    centerSamplesY = []
    sweepRawSamples = []
    minX = 4095
    maxX = 0
    minY = 4095
    maxY = 0

    calibrationPreviousMode = config.mode

    if (config.mode !== 0) {
      const disabled = await updateConfigWithToast(
        { mode: 0 },
        "Calibration started, but the joystick mode could not be temporarily disabled.",
      )
      if (!disabled) {
        calibrationPreviousMode = null
        return
      }
    }

    calibrationPhase = "rest"
  }

  function nextCalibrationStep() {
    if (calibrationPhase === "rest") {
      calibrationPhase = "max"
    } else if (calibrationPhase === "max") {
      void finishCalibration()
    }
  }

  async function cancelCalibration() {
    calibrationPhase = "idle"
    sweepRawSamples = []
    if (calibrationPreviousMode !== null && config) {
      const restoreMode = calibrationPreviousMode
      calibrationPreviousMode = null
      if (config.mode !== restoreMode) {
        await updateConfigWithToast(
          { mode: restoreMode },
          "Calibration was canceled, but the previous joystick mode could not be restored.",
        )
      }
    }
  }

  async function finishCalibration() {
    if (!config) return

    if (!restAssessment.stable) {
      toast.error(
        `Rest calibration was unstable (spread x=${Math.round(
          restAssessment.x.spread,
        )}, y=${Math.round(restAssessment.y.spread)}). Restart and keep the stick centered before Next.`,
      )
      return
    }

    const previewCandidate = sweepCalibration
    if (!previewCandidate) return

    const candidate = optimizeCalibrationCandidate(
      previewCandidate,
      sweepRawSamples,
    )

    const updated = {
      ...config,
      x: candidate.x,
      y: candidate.y,
      radialBoundaries: candidate.radialBoundaries,
    }
    if (calibrationPreviousMode !== null) {
      updated.mode = calibrationPreviousMode
    }

    lastSweepCalibration = candidate
    lastSweepRawSamples = [...sweepRawSamples]
    sweepRawSamples = []
    calibrationPhase = "idle"
    calibrationPreviousMode = null

    try {
      await persistSharedCalibration(updated, updated.mode)
      // Clear mixed pre/post-calibration samples so live circularity only
      // reflects the saved config after the user performs a fresh sweep.
      liveSamples = []
      clearFreshCapture()
      hostGamepadSamples = []
      toast.success(
        keyboard.metadata.numProfiles > 1
          ? "Joystick calibration was saved and shared across all profiles."
          : "Joystick calibration was saved.",
      )
    } catch (error) {
      toast.error("Calibration values could not be saved to the keyboard.")
      console.error(error)
    }
  }

  function circularityTone(score: number, sufficient: boolean) {
    if (!sufficient) return "bg-muted text-muted-foreground"
    if (score >= 90) return "bg-emerald-500/15 text-emerald-700"
    if (score >= 75) return "bg-sky-500/15 text-sky-700"
    if (score >= 60) return "bg-amber-500/15 text-amber-700"
    return "bg-rose-500/15 text-rose-700"
  }

  function roundValue(value: number, digits = 2) {
    return Number(value.toFixed(digits))
  }

  function circularityScoreDelta(
    measured: CircularityReport,
    reference: CircularityReport,
  ) {
    return roundValue(Math.abs(measured.score - reference.score))
  }

  function describeLinuxHostPrediction(
    measured: CircularityReport,
    referenceOut: CircularityReport,
    defaultJoydevPrediction: CircularityReport,
  ) {
    if (!measured.sampleCount || !measured.sufficient) {
      return "Measured Linux browser host capture is not available yet. The Linux prediction is only the default joydev baseline for an uncorrected setup."
    }

    const measuredVsOut = Math.abs(measured.score - referenceOut.score)
    const measuredVsPrediction = Math.abs(
      measured.score - defaultJoydevPrediction.score,
    )

    if (measuredVsOut <= 2 && measuredVsPrediction >= 4) {
      return `Measured Linux browser host matches firmware OUT within ${roundValue(measuredVsOut)} points. Treat the measured host score as authoritative here; the Linux prediction is only an uncorrected baseline.`
    }

    if (measuredVsPrediction <= 2 && measuredVsOut >= 4) {
      return `Measured Linux browser host still matches the default joydev baseline within ${roundValue(measuredVsPrediction)} points. If you expected a jscal override, re-check it; otherwise this is the expected uncorrected Linux result.`
    }

    return "Measured Linux browser host sits between firmware OUT and the default joydev baseline. Trust the measured host score first, and use the Linux prediction only as a reference for uncorrected Linux setups."
  }

  function serializePoint(point: { x: number; y: number }) {
    return {
      x: roundValue(point.x),
      y: roundValue(point.y),
    }
  }

  function serializeAxes(values: number[]) {
    return values.map((value) => roundValue(value, 4))
  }

  function serializeCircularity(report: typeof liveRawCircularity) {
    return {
      score: roundValue(report.score),
      label: report.label,
      sampleCount: report.sampleCount,
      outerSampleCount: report.outerSampleCount,
      quadrantCoverage: report.quadrantCoverage,
      meanRadius: roundValue(report.meanRadius),
      radiusSpread: roundValue(report.radiusSpread, 4),
      axisRatio: roundValue(report.axisRatio, 4),
      sufficient: report.sufficient,
    }
  }

  function joystickVectorMagnitude(point: JoystickVector) {
    return Math.hypot(point.x, point.y)
  }

  function clearFreshCapture() {
    freshCapturePhase = "idle"
    freshLiveSamples = []
    freshHostGamepadSamples = []
  }

  function completeFreshCapture() {
    if (freshCapturePhase !== "capturing") return

    freshCapturePhase = "complete"
    toast.success("Fresh joystick capture completed.")
  }

  function updateFreshCapture(sample: JoystickDiagnosticSample) {
    if (calibrationPhase !== "idle") return

    const magnitude = joystickVectorMagnitude(sample.out)

    if (freshCapturePhase === "armed") {
      if (magnitude < FRESH_CAPTURE_START_THRESHOLD) return

      freshCapturePhase = "capturing"
      freshLiveSamples = [sample]
      freshHostGamepadSamples = []
      return
    }

    if (freshCapturePhase !== "capturing") return

    const nextSamples = pushBoundedSample(
      untrack(() => freshLiveSamples),
      sample,
      FRESH_CAPTURE_MAX_SAMPLES,
    )

    freshLiveSamples = nextSamples

    if (nextSamples.length >= FRESH_CAPTURE_MAX_SAMPLES) {
      completeFreshCapture()
    }
  }

  async function updateActiveMousePreset(
    nextPreset: Partial<HMK_JoystickMousePreset>,
  ) {
    if (!config) return
    const currentConfig = config

    if (!supportsJoystickMousePresets) {
      await updateConfig({
        mouseSpeed: nextPreset.mouseSpeed ?? currentConfig.mouseSpeed,
        mouseAcceleration:
          nextPreset.mouseAcceleration ?? currentConfig.mouseAcceleration,
      })
      return
    }

    const activePreset = {
      ...currentConfig.mousePresets[currentConfig.activeMousePreset],
      ...nextPreset,
    }
    const mousePresets = currentConfig.mousePresets.map((preset, index) =>
      index === currentConfig.activeMousePreset ? activePreset : preset,
    )

    await updateConfig({
      mouseSpeed: activePreset.mouseSpeed,
      mouseAcceleration: activePreset.mouseAcceleration,
      mousePresets,
    })
  }

  async function selectMousePreset(index: number) {
    if (!config || !supportsJoystickMousePresets) return

    const nextIndex = Math.max(0, Math.min(index, config.mousePresets.length - 1))
    const preset = config.mousePresets[nextIndex]

    await updateConfig({
      activeMousePreset: nextIndex,
      mouseSpeed: preset.mouseSpeed,
      mouseAcceleration: preset.mouseAcceleration,
    })
  }

  function joystickConfigsEqual(
    left: HMK_JoystickConfig,
    right: HMK_JoystickConfig,
  ) {
    return (
      left.x.min === right.x.min &&
      left.x.center === right.x.center &&
      left.x.max === right.x.max &&
      left.y.min === right.y.min &&
      left.y.center === right.y.center &&
      left.y.max === right.y.max &&
      left.deadzone === right.deadzone &&
      left.mode === right.mode &&
      left.mouseSpeed === right.mouseSpeed &&
      left.mouseAcceleration === right.mouseAcceleration &&
      left.swDebounceMs === right.swDebounceMs &&
      (!supportsJoystickMousePresets ||
        (left.activeMousePreset === right.activeMousePreset &&
          left.mousePresets.length === right.mousePresets.length &&
          left.mousePresets.every(
            (preset, index) =>
              preset.mouseSpeed === right.mousePresets[index]?.mouseSpeed &&
              preset.mouseAcceleration ===
                right.mousePresets[index]?.mouseAcceleration,
          ))) &&
      left.radialBoundaries.length === right.radialBoundaries.length &&
      left.radialBoundaries.every(
        (boundary, index) => boundary === right.radialBoundaries[index],
      )
    )
  }

  async function persistJoystickConfig(updated: HMK_JoystickConfig) {
    if (!config) return

    const previous = config
    config = updated
    configReadbackVerified = null

    try {
      await keyboard.setJoystickConfig?.({ profile, config: updated })

      if (!keyboard.getJoystickConfig) {
        return
      }

      const persisted = await keyboard.getJoystickConfig({ profile })
      config = persisted
      configReadbackVerified = joystickConfigsEqual(updated, persisted)
      if (!configReadbackVerified) {
        throw new Error("Joystick config read-back mismatch")
      }
    } catch (error) {
      config = previous
      configReadbackVerified = false
      throw error
    }
  }

  async function persistSharedCalibration(
    candidate: Pick<HMK_JoystickConfig, "x" | "y" | "radialBoundaries">,
    restoredMode: number | null,
  ) {
    if (!config) return

    const selectedUpdated = {
      ...config,
      x: candidate.x,
      y: candidate.y,
      radialBoundaries: [...candidate.radialBoundaries],
      ...(restoredMode !== null ? { mode: restoredMode } : {}),
    }

    if (
      keyboard.metadata.numProfiles <= 1 ||
      !keyboard.getJoystickConfig ||
      !keyboard.setJoystickConfig
    ) {
      await persistJoystickConfig(selectedUpdated)
      return
    }

    const previousConfig = config
    const previousRuntimeProfileConfig = runtimeProfileConfig
    const previousRuntimeProfileConfigProfile = runtimeProfileConfigProfile
    const previousRuntimeProfileConfigPending = runtimeProfileConfigPending
    const runtimeProfile = joystickState?.profile ?? profile

    config = selectedUpdated
    configReadbackVerified = null

    try {
      for (
        let targetProfile = 0;
        targetProfile < keyboard.metadata.numProfiles;
        targetProfile += 1
      ) {
        const existing = await keyboard.getJoystickConfig({
          profile: targetProfile,
        })
        const updated = {
          ...existing,
          x: candidate.x,
          y: candidate.y,
          radialBoundaries: [...candidate.radialBoundaries],
          ...(targetProfile === profile && restoredMode !== null
            ? { mode: restoredMode }
            : {}),
        }
        await keyboard.setJoystickConfig({ profile: targetProfile, config: updated })
      }

      const persisted = await keyboard.getJoystickConfig({ profile })
      config = persisted
      configReadbackVerified = joystickConfigsEqual(selectedUpdated, persisted)
      if (!configReadbackVerified) {
        throw new Error("Joystick config read-back mismatch")
      }

      if (runtimeProfile !== profile) {
        runtimeProfileConfigPending = runtimeProfile
        runtimeProfileConfig = await keyboard.getJoystickConfig({
          profile: runtimeProfile,
        })
        runtimeProfileConfigProfile = runtimeProfile
        runtimeProfileConfigPending = null
      }
    } catch (error) {
      config = previousConfig
      runtimeProfileConfig = previousRuntimeProfileConfig
      runtimeProfileConfigProfile = previousRuntimeProfileConfigProfile
      runtimeProfileConfigPending = previousRuntimeProfileConfigPending
      configReadbackVerified = false
      throw error
    }
  }

  function getModeLabel(mode: number) {
    return (
      modes.find((entry) => Number(entry.value) === mode)?.label ?? "Unknown"
    )
  }

  function clampHostAxis(value: number) {
    return Math.max(0 - 127, Math.min(127, value * 127))
  }

  function currentHostStickMode(mode: number | null): "left" | "right" | null {
    if (mode === 2) return "left"
    if (mode === 3) return "right"
    return null
  }

  function hostGamepadMagnitude(vector: JoystickVector | null) {
    if (!vector) return 0
    return Math.hypot(vector.x, vector.y)
  }

  function standardHostAxisPair(
    sampledStick: "left" | "right",
  ): [number, number] {
    return sampledStick === "left" ? [0, 1] : [2, 3]
  }

  function hostGamepadRawAxes(gamepad: Gamepad) {
    return Array.from(gamepad.axes, (value) =>
      Number.isFinite(value) ? value : 0,
    )
  }

  function hostGamepadVectorFromRawAxes(
    rawAxes: number[],
    axisPair: [number, number],
  ): JoystickVector | null {
    const [xAxisIndex, yAxisIndex] = axisPair
    if (xAxisIndex >= rawAxes.length || yAxisIndex >= rawAxes.length) {
      return null
    }

    return {
      x: clampHostAxis(rawAxes[xAxisIndex] ?? 0),
      y: clampHostAxis(-(rawAxes[yAxisIndex] ?? 0)),
    }
  }

  function hostGamepadVectorFromAxisPair(
    gamepad: Gamepad,
    axisPair: [number, number],
  ): JoystickVector | null {
    return hostGamepadVectorFromRawAxes(gamepad.axes as unknown as number[], axisPair)
  }

  function hostGamepadFallbackMagnitude(rawAxes: number[]) {
    if (rawAxes.length === 0) return 0

    const [largest = 0, secondLargest = 0] = rawAxes
      .map((value) => Math.abs(clampHostAxis(value)))
      .sort((left, right) => right - left)

    return Math.hypot(largest, secondLargest)
  }

  function detectHostGamepadAxisPair(
    axesHistory: number[][],
  ): [number, number] | null {
    if (axesHistory.length < 8) return null

    const axisCount = axesHistory.reduce(
      (currentMax, values) => Math.max(currentMax, values.length),
      0,
    )
    if (axisCount < 2) return null

    const activeAxes = Array.from({ length: axisCount }, (_, index) => {
      let min = Number.POSITIVE_INFINITY
      let max = Number.NEGATIVE_INFINITY
      let peakAbs = 0

      for (const values of axesHistory) {
        const value = values[index] ?? 0
        min = Math.min(min, value)
        max = Math.max(max, value)
        peakAbs = Math.max(peakAbs, Math.abs(value))
      }

      return {
        index,
        min,
        max,
        peakAbs,
        span: max - min,
        bipolar:
          min <= -HOST_GAMEPAD_AXIS_BIPOLAR_THRESHOLD &&
          max >= HOST_GAMEPAD_AXIS_BIPOLAR_THRESHOLD,
      }
    }).filter(
      (axis) =>
        axis.span >= HOST_GAMEPAD_AXIS_SPAN_THRESHOLD &&
        axis.peakAbs >= HOST_GAMEPAD_AXIS_BIPOLAR_THRESHOLD &&
        axis.bipolar,
    )

    if (activeAxes.length < 2) return null

    let bestCircularPair: { pair: [number, number]; score: number } | null = null
    let bestSpanPair: { pair: [number, number]; score: number } | null = null
    for (let leftIndex = 0; leftIndex < activeAxes.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < activeAxes.length;
        rightIndex += 1
      ) {
        const leftAxis = activeAxes[leftIndex]
        const rightAxis = activeAxes[rightIndex]
        let score = leftAxis.span + rightAxis.span

        if (rightAxis.index === leftAxis.index + 1) {
          score += 0.1
        }
        if (
          leftAxis.index % 2 === 0 &&
          rightAxis.index === leftAxis.index + 1
        ) {
          score += 0.05
        }

        if (!bestSpanPair || score > bestSpanPair.score) {
          bestSpanPair = {
            pair: [leftAxis.index, rightAxis.index],
            score,
          }
        }

        const pair: [number, number] = [leftAxis.index, rightAxis.index]
        const pairPoints = axesHistory
          .map((rawAxes) => hostGamepadVectorFromRawAxes(rawAxes, pair))
          .filter((point): point is JoystickVector => point !== null)
        const circularity = computeJoystickCircularity(pairPoints)

        if (!circularity.sufficient) {
          continue
        }

        const circularityScore = circularity.score + score * 0.01
        if (!bestCircularPair || circularityScore > bestCircularPair.score) {
          bestCircularPair = {
            pair,
            score: circularityScore,
          }
        }
      }
    }

    if (bestCircularPair) {
      return bestCircularPair.pair
    }

    if (
      !bestSpanPair ||
      bestSpanPair.score < HOST_GAMEPAD_AXIS_PAIR_SCORE_THRESHOLD
    ) {
      return null
    }

    return bestSpanPair.pair
  }

  function selectHostGamepadCandidate(
    candidates: HostGamepadCandidate[],
    previousIndex: number | null,
  ) {
    const previousCandidate =
      previousIndex === null
        ? null
        : (candidates.find((candidate) => candidate.index === previousIndex) ??
          null)
    const activeCandidate =
      candidates.find((candidate) => candidate.active) ?? null
    const sampledCandidate =
      candidates.find((candidate) => candidate.vector !== null) ?? null

    return (
      activeCandidate ??
      previousCandidate ??
      sampledCandidate ??
      candidates[0] ??
      null
    )
  }

  function pollHostGamepad() {
    const available =
      typeof navigator !== "undefined" && !!navigator.getGamepads
    if (!available) {
      hostGamepadState = {
        available: false,
        connected: false,
        index: null,
        id: null,
        mapping: null,
        sampledStick: null,
        axisPair: null,
        rawAxes: [],
        vector: null,
        magnitude: 0,
        candidates: [],
      }
      return
    }

    const sampledStick = currentHostStickMode(config?.mode ?? null)
    const connectedGamepads = Array.from(navigator.getGamepads()).filter(
      (gamepad): gamepad is Gamepad => gamepad !== null,
    )
    const candidates = connectedGamepads
      .map((gamepad) => {
        const rawAxes = hostGamepadRawAxes(gamepad)
        const inferredAxisPair =
          sampledStick && gamepad.index === hostGamepadState.index
            ? detectedHostGamepadAxisPair
            : null
        const axisPair = sampledStick
          ? gamepad.mapping === "standard"
            ? standardHostAxisPair(sampledStick)
            : inferredAxisPair
          : null
        const vector = axisPair
          ? hostGamepadVectorFromAxisPair(gamepad, axisPair)
          : null
        const magnitude = vector
          ? hostGamepadMagnitude(vector)
          : hostGamepadFallbackMagnitude(rawAxes)
        return {
          index: gamepad.index,
          id: gamepad.id,
          mapping: gamepad.mapping,
          axes: gamepad.axes.length,
          buttons: gamepad.buttons.length,
          sampledStick,
          axisPair,
          rawAxes,
          vector,
          magnitude,
          active: magnitude >= HOST_GAMEPAD_ACTIVE_THRESHOLD,
          selected: false,
        }
      })
      .sort((left, right) => right.magnitude - left.magnitude)

    if (candidates.length === 0) {
      hostGamepadState = {
        available: true,
        connected: false,
        index: null,
        id: null,
        mapping: null,
        sampledStick,
        axisPair: null,
        rawAxes: [],
        vector: null,
        magnitude: 0,
        candidates: [],
      }
      return
    }

    const selectedCandidate = selectHostGamepadCandidate(
      candidates,
      hostGamepadState.index,
    )
    const selectedCandidates = candidates.map((candidate) => ({
      ...candidate,
      selected: candidate.index === selectedCandidate?.index,
    }))

    hostGamepadState = {
      available: true,
      connected: selectedCandidate !== null,
      index: selectedCandidate?.index ?? null,
      id: selectedCandidate?.id ?? null,
      mapping: selectedCandidate?.mapping ?? null,
      sampledStick,
      axisPair: selectedCandidate?.axisPair ?? null,
      rawAxes: selectedCandidate?.rawAxes ?? [],
      vector: selectedCandidate?.vector ?? null,
      magnitude: selectedCandidate?.magnitude ?? 0,
      candidates: selectedCandidates,
    }
  }

  function buildDiagnosticLog() {
    if (!config) return null

    return {
      generatedAt: new Date().toISOString(),
      source: "hmkconf joystick tab",
      keyboard: {
        name: keyboard.metadata.name,
        id: keyboard.id,
        firmwareVersion: keyboard.version,
        firmwareVersionLabel: displayVersion(keyboard.version),
        profile,
      },
      transport: {
        xInputEnabled: options?.xInputEnabled ?? null,
        activeGamepadTransport: currentGamepadTransport,
        joystickModeReadyForGamepadValidation:
          config.mode === 2 || config.mode === 3,
        hostGamepad: {
          backend: hostGamepadBackend,
          available: hostGamepadState.available,
          connected: hostGamepadState.connected,
          index: hostGamepadState.index,
          id: hostGamepadState.id,
          mapping: hostGamepadState.mapping,
          sampledStick: hostGamepadState.sampledStick,
          axisPair: hostGamepadState.axisPair,
          rawAxes: serializeAxes(hostGamepadState.rawAxes),
          magnitude: roundValue(hostGamepadState.magnitude),
          candidates: hostGamepadState.candidates.map((candidate) => ({
            index: candidate.index,
            id: candidate.id,
            mapping: candidate.mapping,
            axes: candidate.axes,
            buttons: candidate.buttons,
            axisPair: candidate.axisPair,
            rawAxes: serializeAxes(candidate.rawAxes),
            magnitude: roundValue(candidate.magnitude),
            active: candidate.active,
            selected: candidate.selected,
            vector: candidate.vector ? serializePoint(candidate.vector) : null,
          })),
          circularity: serializeCircularity(hostGamepadCircularity),
          predictedLinuxJoydevAssumption: LINUX_JOYDEV_PREDICTION_ASSUMPTION,
          predictedLinuxJoydevRole: LINUX_JOYDEV_PREDICTION_ROLE,
          predictedLinuxJoydevCircularity: serializeCircularity(
            livePredictedLinuxHostCircularity,
          ),
          linuxMeasuredVsOutDelta: isLinuxHost
            ? liveLinuxMeasuredVsOutDelta
            : null,
          linuxMeasuredVsPredictedJoydevDelta: isLinuxHost
            ? liveLinuxMeasuredVsPredictionDelta
            : null,
          linuxMeasurementInterpretation: isLinuxHost
            ? liveLinuxHostInterpretation
            : null,
          pointsTail: hostGamepadPoints
            .slice(-DIAGNOSTIC_EXPORT_POINT_LIMIT)
            .map(serializePoint),
        },
      },
      joystick: {
        mode: {
          value: config.mode,
          label: getModeLabel(config.mode),
        },
        configReadbackVerified,
        selectedProfile: profile,
        runtimeProfile: joystickState?.profile ?? null,
        diagnosticProfile,
        config,
        diagnosticConfig,
        latestState: joystickState,
      },
      diagnostics: {
        live: {
          rawCircularity: serializeCircularity(liveRawCircularity),
          calibratedCircularity: liveCalibratedPoints.length
            ? serializeCircularity(liveCalibratedCircularity)
            : null,
          correctedCircularity: liveCorrectedPoints.length
            ? serializeCircularity(liveCorrectedCircularity)
            : null,
          outCircularity: serializeCircularity(liveOutCircularity),
          referenceOutCircularity: serializeCircularity(
            liveReferenceOutCircularity,
          ),
          predictedLinuxHostAssumption: LINUX_JOYDEV_PREDICTION_ASSUMPTION,
          predictedLinuxHostRole: LINUX_JOYDEV_PREDICTION_ROLE,
          predictedLinuxHostCircularity: serializeCircularity(
            livePredictedLinuxHostCircularity,
          ),
          linuxMeasuredVsOutDelta: isLinuxHost
            ? liveLinuxMeasuredVsOutDelta
            : null,
          linuxMeasuredVsPredictedDelta: isLinuxHost
            ? liveLinuxMeasuredVsPredictionDelta
            : null,
          linuxHostInterpretation: isLinuxHost
            ? liveLinuxHostInterpretation
            : null,
          rawPointsTail: liveRawPoints
            .slice(-DIAGNOSTIC_EXPORT_POINT_LIMIT)
            .map(serializePoint),
          calibratedPointsTail: liveCalibratedPoints
            .slice(-DIAGNOSTIC_EXPORT_POINT_LIMIT)
            .map(serializePoint),
          correctedPointsTail: liveCorrectedPoints
            .slice(-DIAGNOSTIC_EXPORT_POINT_LIMIT)
            .map(serializePoint),
          outPointsTail: liveOutPoints
            .slice(-DIAGNOSTIC_EXPORT_POINT_LIMIT)
            .map(serializePoint),
          referenceOutPointsTail: liveReferenceOutPoints
            .slice(-DIAGNOSTIC_EXPORT_POINT_LIMIT)
            .map(serializePoint),
          predictedLinuxHostPointsTail: livePredictedLinuxHostPoints
            .slice(-DIAGNOSTIC_EXPORT_POINT_LIMIT)
            .map(serializePoint),
        },
        freshCapture: {
          phase: freshCapturePhase,
          sampleCount: freshLiveSamples.length,
          rawCircularity: serializeCircularity(freshRawCircularity),
          calibratedCircularity: freshCalibratedPoints.length
            ? serializeCircularity(freshCalibratedCircularity)
            : null,
          correctedCircularity: freshCorrectedPoints.length
            ? serializeCircularity(freshCorrectedCircularity)
            : null,
          outCircularity: serializeCircularity(freshOutCircularity),
          referenceOutCircularity: serializeCircularity(
            freshReferenceOutCircularity,
          ),
          predictedLinuxHostAssumption: LINUX_JOYDEV_PREDICTION_ASSUMPTION,
          predictedLinuxHostRole: LINUX_JOYDEV_PREDICTION_ROLE,
          predictedLinuxHostCircularity: serializeCircularity(
            freshPredictedLinuxHostCircularity,
          ),
          hostCircularity: serializeCircularity(freshHostCircularity),
          linuxMeasuredVsOutDelta: isLinuxHost
            ? freshLinuxMeasuredVsOutDelta
            : null,
          linuxMeasuredVsPredictedDelta: isLinuxHost
            ? freshLinuxMeasuredVsPredictionDelta
            : null,
          linuxHostInterpretation: isLinuxHost
            ? freshLinuxHostInterpretation
            : null,
          rawPointsTail: freshRawPoints
            .slice(-DIAGNOSTIC_EXPORT_POINT_LIMIT)
            .map(serializePoint),
          calibratedPointsTail: freshCalibratedPoints
            .slice(-DIAGNOSTIC_EXPORT_POINT_LIMIT)
            .map(serializePoint),
          correctedPointsTail: freshCorrectedPoints
            .slice(-DIAGNOSTIC_EXPORT_POINT_LIMIT)
            .map(serializePoint),
          outPointsTail: freshOutPoints
            .slice(-DIAGNOSTIC_EXPORT_POINT_LIMIT)
            .map(serializePoint),
          referenceOutPointsTail: freshReferenceOutPoints
            .slice(-DIAGNOSTIC_EXPORT_POINT_LIMIT)
            .map(serializePoint),
          predictedLinuxHostPointsTail: freshPredictedLinuxHostPoints
            .slice(-DIAGNOSTIC_EXPORT_POINT_LIMIT)
            .map(serializePoint),
          hostPointsTail: freshHostPoints
            .slice(-DIAGNOSTIC_EXPORT_POINT_LIMIT)
            .map(serializePoint),
        },
        calibration: {
          phase: calibrationPhase,
          previousMode: calibrationPreviousMode,
          centerSampleCount: centerSamplesX.length,
          centerAssessment: {
            stable: restAssessment.stable,
            x: {
              center: restAssessment.x.center,
              spread: roundValue(restAssessment.x.spread),
              sampleCount: restAssessment.x.sampleCount,
              stable: restAssessment.x.stable,
            },
            y: {
              center: restAssessment.y.center,
              spread: roundValue(restAssessment.y.spread),
              sampleCount: restAssessment.y.sampleCount,
              stable: restAssessment.y.stable,
            },
          },
          sweepSampleCount: displayedSweepRawSamples.length,
          sweepBounds: {
            minX,
            maxX,
            minY,
            maxY,
          },
          sweepCircularity: serializeCircularity(sweepCircularity),
          sweepOutputCircularity: serializeCircularity(sweepOutputCircularity),
          displayedSweepCalibration,
          sweepRawSamples: displayedSweepRawSamples,
          correctedSweepPointsTail: displayedSweepPoints
            .slice(-DIAGNOSTIC_EXPORT_POINT_LIMIT)
            .map(serializePoint),
          correctedSweepOutputPointsTail: displayedSweepOutputPoints
            .slice(-DIAGNOSTIC_EXPORT_POINT_LIMIT)
            .map(serializePoint),
        },
      },
      guidance: [
        "If RAW circularity is poor, the issue is likely sensor or mechanics before firmware output.",
        "If RAW is good and OUT is poor, the issue is likely firmware circular correction or deadzone behavior.",
        `Current gamepad transport is ${currentGamepadTransport}.`,
        supportsHostTransportComparison
          ? "For host-side comparison, switch the joystick mode to XInput Left Stick or Right Stick, then test the same sweep twice: once with XInput enabled and once with XInput disabled."
          : "On Linux, Chromium/Electron reads Gamepad API axes through joydev rather than raw evdev/HID values. Use firmware OUT to validate the correction path, then use measured host capture as the real Linux browser result.",
        "Predicted Linux host circularity is a default joydev reference only. It ignores jscal overrides; when measured host capture is available, trust that measured host score instead.",
        ...(isLinuxHost
          ? [`Linux comparison summary: ${freshLinuxHostInterpretation}`]
          : []),
      ],
    }
  }

  async function copyDiagnosticLog() {
    const diagnosticLog = buildDiagnosticLog()
    if (!diagnosticLog) return

    if (!navigator.clipboard?.writeText) {
      toast.error("Clipboard access is not available in this environment.")
      return
    }

    try {
      await navigator.clipboard.writeText(
        JSON.stringify(diagnosticLog, null, 2),
      )
      toast.success("Joystick diagnostic log copied to clipboard.")
    } catch (error) {
      toast.error("Joystick diagnostic log could not be copied.")
      console.error(error)
    }
  }

  function resetLiveDiagnostics() {
    liveSamples = []
    hostGamepadSamples = []
    hostGamepadAxesHistory = []
    hostGamepadAxesSourceKey = null
    hostGamepadSampleSourceKey = null
    toast.success("Live joystick diagnostics were reset.")
  }

  function startFreshCapture() {
    clearFreshCapture()
    freshCapturePhase = "armed"
    toast.success("Fresh joystick capture armed. Move the joystick to start.")
  }

  function cancelFreshCapture() {
    clearFreshCapture()
    toast.success("Fresh joystick capture canceled.")
  }

  function stopFreshCapture() {
    completeFreshCapture()
  }
</script>

<div
  class={cn(
    "mx-auto flex size-full max-w-3xl flex-col gap-6 overflow-y-auto p-4",
    className,
  )}
  {...props}
>
  {#if loading || !config}
    <p class="text-muted-foreground">Loading Joystick configuration...</p>
  {:else}
    <div class="flex flex-col gap-2">
      <div class="grid text-sm">
        <span class="font-semibold">Operation Mode</span>
        <span class="text-muted-foreground"
          >Select how the joystick interacts with the host.</span
        >
      </div>
      <Select.Root
        bind:value={
          () => String(config!.mode), (v) => updateConfig({ mode: Number(v) })
        }
        type="single"
      >
        <Select.Trigger class="w-64" size="sm">
          {modes.find((e) => e.value === String(config?.mode))?.label ||
            "Disabled"}
        </Select.Trigger>
        <Select.Content class="w-[var(--bits-select-anchor-width)]">
          {#each modes as m (m.value)}
            <Select.Item value={m.value}>{m.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    <!-- Mode Specific Settings -->
    {#if supportsJoystickMousePresets && (config.mode === 1 || config.mode === 4)}
      <div class="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <div class="grid text-sm">
          <span class="font-medium"
            >Mouse Preset {config.activeMousePreset + 1}</span
          >
          <span class="text-muted-foreground"
            >Store four speed and acceleration pairs, then cycle them from the
            keymap with `Joy Preset Next`.</span
          >
        </div>
        <div class="flex flex-wrap gap-2">
          {#each config.mousePresets as preset, index (index)}
            <Button
              size="sm"
              variant={index === config.activeMousePreset ? "default" : "outline"}
              onclick={() => void selectMousePreset(index)}
            >
              P{index + 1}: {preset.mouseSpeed}/{preset.mouseAcceleration}
            </Button>
          {/each}
        </div>
      </div>
    {/if}

    {#if config.mode === 1 || config.mode === 4}
      <div class="flex flex-col gap-2">
        <div class="grid text-sm">
          <span class="font-medium">Mouse Speed: {config.mouseSpeed}</span>
          <span class="text-muted-foreground"
            >Adjust how fast the cursor moves.</span
          >
        </div>
        <Slider
          type="single"
          bind:value={
            () => config!.mouseSpeed, (v) => updateActiveMousePreset({ mouseSpeed: v })
          }
          max={50}
          min={1}
          step={1}
        />
      </div>
    {/if}

    {#if config.mode === 1}
      <div class="flex flex-col gap-2">
        <div class="grid text-sm">
          <span class="font-medium"
            >Mouse Acceleration: {config.mouseAcceleration}</span
          >
          <span class="text-muted-foreground"
            >Lower values feel more linear. Higher values increase the speed
            boost near the edge.</span
          >
        </div>
        <Slider
          type="single"
          bind:value={
            () => config!.mouseAcceleration,
            (v) => updateActiveMousePreset({ mouseAcceleration: v })
          }
          max={255}
          min={1}
          step={1}
        />
      </div>
    {/if}

    <div class="flex flex-col gap-2">
      <div class="grid text-sm">
        <span class="font-medium"
          >Deadzone: {Math.round((config.deadzone / 255) * 100)}%</span
        >
        <span class="text-muted-foreground"
          >Inner area where input is ignored to prevent drift.</span
        >
      </div>
      <Slider
        type="single"
        bind:value={
          () => config!.deadzone, (v) => updateConfig({ deadzone: v })
        }
        max={127}
        min={0}
        step={1}
      />
    </div>

    <div class="flex flex-col gap-2">
      <div class="grid text-sm">
        <span class="font-medium">Button Debounce: {config.swDebounceMs}ms</span
        >
        <span class="text-muted-foreground"
          >Stabilization time for the push switch to prevent chattering.</span
        >
      </div>
      <Slider
        type="single"
        bind:value={
          () => config!.swDebounceMs, (v) => updateConfig({ swDebounceMs: v })
        }
        max={50}
        min={0}
        step={1}
      />
    </div>

    <!-- State Monitor -->
    <div class="mt-4 rounded-xl border bg-card p-4">
      <h3 class="mb-4 text-sm font-semibold">Live Monitor</h3>
      <div class="grid grid-cols-2 gap-4 font-mono text-xs">
        <div>
          STATE PROFILE: {joystickState?.profile ?? 0}<br />
          RAW X: {joystickState?.rawX ?? 0}<br />
          RAW Y: {joystickState?.rawY ?? 0}<br />
        </div>
        <div>
          OUT X: {joystickState?.outX ?? 0}<br />
          OUT Y: {joystickState?.outY ?? 0}<br />
          CAL X: {joystickState?.calibratedX ?? 0}<br />
          CAL Y: {joystickState?.calibratedY ?? 0}<br />
          CORR X: {joystickState?.correctedX ?? 0}<br />
          CORR Y: {joystickState?.correctedY ?? 0}<br />
          REF X: {currentReferenceOut?.x ?? 0}<br />
          REF Y: {currentReferenceOut?.y ?? 0}<br />
          BTN: {joystickState?.sw ? "PRESSED" : "RELEASED"}
        </div>
      </div>
      {#if joystickState && joystickState.profile !== profile}
        <p class="mt-3 text-xs text-amber-600">
          The device is currently running profile {joystickState.profile}, but this
          tab is showing config for profile {profile}. Diagnostics below use the
          runtime profile config when available, but edits still apply to profile
          {profile}.
        </p>
      {/if}
    </div>

    <div class="grid gap-4 lg:grid-cols-3">
      <JoystickDiagnosticPlot
        title="Normalized RAW Shape"
        subtitle="ADC samples normalized with the current joystick calibration."
        points={liveRawPoints}
        pointClass="fill-amber-500/20"
        lastPointClass="fill-amber-500 stroke-background stroke-2"
      />
      <JoystickDiagnosticPlot
        title="Firmware OUT Shape"
        subtitle="The common firmware output after calibration and radial deadzone."
        points={liveOutPoints}
        pointClass="fill-emerald-500/20"
        lastPointClass="fill-emerald-500 stroke-background stroke-2"
      />
      <JoystickDiagnosticPlot
        title="Reference OUT Shape"
        subtitle="What the host-side reference implementation predicts from RAW plus the current config."
        points={liveReferenceOutPoints}
        pointClass="fill-cyan-500/20"
        lastPointClass="fill-cyan-500 stroke-background stroke-2"
      />
    </div>

    <div class="grid gap-4 lg:grid-cols-4">
      <div class="rounded-xl border bg-card p-4">
        <div class="mb-3 flex items-center justify-between gap-3">
          <div class="grid text-sm">
            <span class="font-medium">RAW Circularity</span>
            <span class="text-muted-foreground">
              Checks the common input path before transport-specific reporting.
            </span>
          </div>
          <span
            class={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              circularityTone(
                liveRawCircularity.score,
                liveRawCircularity.sufficient,
              ),
            )}
          >
            {liveRawCircularity.label}
          </span>
        </div>
        <div class="font-mono text-3xl font-semibold">
          {Math.round(liveRawCircularity.score)}
        </div>
        <div
          class="mt-3 grid grid-cols-2 gap-2 font-mono text-xs text-muted-foreground"
        >
          <div>Outer Samples: {liveRawCircularity.outerSampleCount}</div>
          <div>Quadrants: {liveRawCircularity.quadrantCoverage}/4</div>
          <div>
            Axis Ratio: {Math.round(liveRawCircularity.axisRatio * 100)}%
          </div>
          <div>
            Radius Spread: {Math.round(liveRawCircularity.radiusSpread * 100)}%
          </div>
        </div>
      </div>

      <div class="rounded-xl border bg-card p-4">
        <div class="mb-3 flex items-center justify-between gap-3">
          <div class="grid text-sm">
            <span class="font-medium">OUT Circularity</span>
            <span class="text-muted-foreground">
              Captures what the shared firmware path hands to mouse or gamepad
              logic.
            </span>
          </div>
          <span
            class={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              circularityTone(
                liveOutCircularity.score,
                liveOutCircularity.sufficient,
              ),
            )}
          >
            {liveOutCircularity.label}
          </span>
        </div>
        <div class="font-mono text-3xl font-semibold">
          {Math.round(liveOutCircularity.score)}
        </div>
        <div
          class="mt-3 grid grid-cols-2 gap-2 font-mono text-xs text-muted-foreground"
        >
          <div>Outer Samples: {liveOutCircularity.outerSampleCount}</div>
          <div>Quadrants: {liveOutCircularity.quadrantCoverage}/4</div>
          <div>
            Axis Ratio: {Math.round(liveOutCircularity.axisRatio * 100)}%
          </div>
          <div>
            Radius Spread: {Math.round(liveOutCircularity.radiusSpread * 100)}%
          </div>
        </div>
      </div>

      <div class="rounded-xl border bg-card p-4">
        <div class="mb-3 flex items-center justify-between gap-3">
          <div class="grid text-sm">
            <span class="font-medium">Reference OUT Circularity</span>
            <span class="text-muted-foreground">
              Host-side prediction from RAW, circular correction, and radial deadzone.
            </span>
          </div>
          <span
            class={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              circularityTone(
                liveReferenceOutCircularity.score,
                liveReferenceOutCircularity.sufficient,
              ),
            )}
          >
            {liveReferenceOutCircularity.label}
          </span>
        </div>
        <div class="font-mono text-3xl font-semibold">
          {Math.round(liveReferenceOutCircularity.score)}
        </div>
        <div
          class="mt-3 grid grid-cols-2 gap-2 font-mono text-xs text-muted-foreground"
        >
          <div>Outer Samples: {liveReferenceOutCircularity.outerSampleCount}</div>
          <div>Quadrants: {liveReferenceOutCircularity.quadrantCoverage}/4</div>
          <div>
            Axis Ratio: {Math.round(liveReferenceOutCircularity.axisRatio * 100)}%
          </div>
          <div>
            Radius Spread: {Math.round(liveReferenceOutCircularity.radiusSpread * 100)}%
          </div>
        </div>
      </div>

      <div class="rounded-xl border bg-card p-4">
        <div class="mb-3 flex items-center justify-between gap-3">
          <div class="grid text-sm">
            <span class="font-medium">Sweep Circularity</span>
            <span class="text-muted-foreground">
              Uses the calibration sweep to estimate the next X/Y min-center-max
              and angle-based boundary map.
            </span>
          </div>
          <span
            class={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              circularityTone(
                sweepCircularity.score,
                sweepCircularity.sufficient,
              ),
            )}
          >
            {sweepCircularity.label}
          </span>
        </div>
        <div class="font-mono text-3xl font-semibold">
          {Math.round(sweepCircularity.score)}
        </div>
        <div
          class="mt-3 grid grid-cols-2 gap-2 font-mono text-xs text-muted-foreground"
        >
          <div>Outer Samples: {sweepCircularity.outerSampleCount}</div>
          <div>Quadrants: {sweepCircularity.quadrantCoverage}/4</div>
          <div>Axis Ratio: {Math.round(sweepCircularity.axisRatio * 100)}%</div>
          <div>
            Radius Spread: {Math.round(sweepCircularity.radiusSpread * 100)}%
          </div>
        </div>
      </div>
    </div>

    <div class="rounded-xl border bg-card p-4">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div class="grid text-sm">
          <span class="font-medium">Fresh Capture</span>
          <span class="text-muted-foreground">{freshCaptureStatus}</span>
        </div>
        <div class="flex flex-col gap-2 sm:flex-row">
          {#if freshCapturePhase === "capturing"}
            <Button
              variant="outline"
              size="sm"
              onclick={stopFreshCapture}
              disabled={!joystickState}
            >
              Stop Fresh Capture
            </Button>
          {:else if freshCapturePhase === "armed"}
            <Button
              variant="outline"
              size="sm"
              onclick={cancelFreshCapture}
              disabled={!joystickState}
            >
              Cancel Fresh Capture
            </Button>
          {:else}
            <Button
              variant="outline"
              size="sm"
              onclick={startFreshCapture}
              disabled={!joystickState || calibrationPhase !== "idle"}
            >
              Start Fresh Capture
            </Button>
          {/if}
        </div>
      </div>
      <div class="mt-4 grid gap-4 lg:grid-cols-3">
        <div class="rounded-xl border bg-muted/20 p-4">
          <div class="grid text-sm">
            <span class="font-medium">Fresh RAW</span>
            <span class="text-muted-foreground">
              Fixed-window capture from motion start to sweep end.
            </span>
          </div>
          <div class="mt-3 font-mono text-3xl font-semibold">
            {Math.round(freshRawCircularity.score)}
          </div>
          <div class="mt-3 font-mono text-xs text-muted-foreground">
            Samples: {freshLiveSamples.length}
          </div>
        </div>
        <div class="rounded-xl border bg-muted/20 p-4">
          <div class="grid text-sm">
            <span class="font-medium">Fresh OUT</span>
            <span class="text-muted-foreground">
              This is the stable number to compare across sweeps.
            </span>
          </div>
          <div class="mt-3 font-mono text-3xl font-semibold">
            {Math.round(freshOutCircularity.score)}
          </div>
          <div class="mt-3 font-mono text-xs text-muted-foreground">
            Samples: {freshLiveSamples.length}
          </div>
        </div>
        <div class="rounded-xl border bg-muted/20 p-4">
          <div class="grid text-sm">
            <span class="font-medium">Fresh Host</span>
            <span class="text-muted-foreground">
              {freshHostSubtitle}
            </span>
          </div>
          <div class="mt-3 font-mono text-3xl font-semibold">
            {Math.round(freshHostCircularity.score)}
          </div>
          <div class="mt-3 font-mono text-xs text-muted-foreground">
            Samples: {freshHostGamepadSamples.length}
          </div>
        </div>
      </div>
    </div>

    <JoystickDiagnosticPlot
      title="Calibration Sweep Shape"
      subtitle="Shows the predicted firmware output after the next calibration and circular correction."
      points={displayedSweepPoints}
      pointClass="fill-sky-500/20"
      lastPointClass="fill-sky-500 stroke-background stroke-2"
    />

    <div class="rounded-xl border bg-card p-4">
      <h3 class="mb-2 text-sm font-semibold">Transport Validation</h3>
      <div class="grid gap-2 text-sm text-muted-foreground">
        <span>
          These plots validate the shared firmware path first: raw ADC, per-axis
          calibration, circular correction, and radial deadzone.
        </span>
        <span>
          {transportValidationAdvice}
        </span>
      </div>
      <div
        class="mt-4 grid gap-2 rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground"
      >
        <span>
          Current gamepad transport: <span class="font-medium text-foreground"
            >{currentGamepadTransport}</span
          >
        </span>
        <span>
          Host gamepad backend: <span class="font-medium text-foreground"
            >{hostGamepadBackend}</span
          >
        </span>
        {#if isLinuxHost}
          {#if hostGamepadCircularity.sampleCount > 0}
            <span>
              Measured Linux browser host circularity:
              <span class="font-medium text-foreground"
                >{Math.round(hostGamepadCircularity.score)}</span
              >
            </span>
          {:else}
            <span>
              Measured Linux browser host circularity:
              <span class="font-medium text-foreground"
                >waiting for host samples</span
              >
            </span>
          {/if}
          <span>{liveLinuxHostInterpretation}</span>
          <span>
            Default Linux joydev reference from firmware OUT
            (reference only, ignores jscal overrides):
            <span class="font-medium text-foreground"
              >{Math.round(livePredictedLinuxHostCircularity.score)}</span
            >
          </span>
        {/if}
        <span>{gamepadHostValidationMode}</span>
        <span>{hostGamepadStatus}</span>
      </div>
      <div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <JoystickDiagnosticPlot
          title="Host Gamepad Shape"
          subtitle="Reads the first connected gamepad from the host using the selected left or right stick."
          points={hostGamepadPoints}
          pointClass="fill-fuchsia-500/20"
          lastPointClass="fill-fuchsia-500 stroke-background stroke-2"
        />
        <div class="rounded-xl border bg-muted/20 p-4">
          <div class="mb-3 flex items-center justify-between gap-3">
            <div class="grid text-sm">
              <span class="font-medium">Host Circularity</span>
              <span class="text-muted-foreground">
                {hostCircularitySubtitle}
              </span>
            </div>
            <span
              class={cn(
                "rounded-full px-3 py-1 text-xs font-semibold",
                circularityTone(
                  hostGamepadCircularity.score,
                  hostGamepadCircularity.sufficient,
                ),
              )}
            >
              {hostGamepadCircularity.label}
            </span>
          </div>
          <div class="font-mono text-3xl font-semibold">
            {Math.round(hostGamepadCircularity.score)}
          </div>
          <div
            class="mt-3 grid grid-cols-2 gap-2 font-mono text-xs text-muted-foreground"
          >
            <div>Outer Samples: {hostGamepadCircularity.outerSampleCount}</div>
            <div>Quadrants: {hostGamepadCircularity.quadrantCoverage}/4</div>
            <div>
              Axis Ratio: {Math.round(hostGamepadCircularity.axisRatio * 100)}%
            </div>
            <div>
              Radius Spread: {Math.round(
                hostGamepadCircularity.radiusSpread * 100,
              )}%
            </div>
          </div>
          {#if hostGamepadState.connected}
            <div class="mt-3 text-xs text-muted-foreground">
              Gamepad #{hostGamepadState.index}: {hostGamepadState.id}
            </div>
          {/if}
        </div>
      </div>
      <div
        class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <p class="text-sm text-muted-foreground">
          Copy a structured log after calibration and paste it into chat for
          remote diagnosis.
        </p>
        <div class="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            size="sm"
            onclick={resetLiveDiagnostics}
            disabled={!joystickState}
          >
            Reset Live Diagnostics
          </Button>
          <Button
            variant="outline"
            size="sm"
            onclick={copyDiagnosticLog}
            disabled={!joystickState}
          >
            Copy Diagnostic Log
          </Button>
        </div>
      </div>
    </div>

    <!-- Calibration Wizard -->
    <div class="mt-4 rounded-xl border bg-card p-4">
      <h3 class="mb-2 text-lg font-semibold">Calibration</h3>

      {#if calibrationPhase === "idle"}
        <p class="mb-4 text-sm text-muted-foreground">
          Click below to calibrate the joystick's resting center and maximum
          ranges. Mouse/scroll output is temporarily disabled during
          calibration.
          {#if keyboard.metadata.numProfiles > 1}
            The measured center, travel range, and boundary map are shared
            across all profiles, while profile-specific behavior like mode and
            deadzone stays as-is.
          {/if}
        </p>
        <Button onclick={startCalibration}>Start Calibration</Button>
        <div
          class="mt-4 grid grid-cols-2 gap-2 font-mono text-xs text-muted-foreground"
        >
          <div>
            X Min: {config.x.min}<br />
            X Ctr: {config.x.center}<br />
            X Max: {config.x.max}<br />
          </div>
          <div>
            Y Min: {config.y.min}<br />
            Y Ctr: {config.y.center}<br />
            Y Max: {config.y.max}<br />
          </div>
        </div>
      {:else}
        <div class="mb-4 rounded-lg bg-primary/10 p-4">
          {#if calibrationPhase === "rest"}
            <p class="font-medium text-foreground">
              Step 1: Release the joystick.
            </p>
            <p class="mt-1 text-sm text-muted-foreground">
              Do not touch the joystick so its natural center point can be
              recorded.
            </p>
          {:else if calibrationPhase === "max"}
            <p class="font-medium text-foreground">
              Step 2: Move the joystick in all directions.
            </p>
            <p class="mt-1 text-sm text-muted-foreground">
              Roll it slowly around the outer edge a few times to record the
              maximum range. Aim to cover all four quadrants while keeping the
              Sweep Circularity card as high as possible.
            </p>
          {/if}
        </div>

        <div class="flex gap-2">
          <Button variant="outline" onclick={cancelCalibration}>Cancel</Button>
          <Button onclick={nextCalibrationStep}>
            {calibrationPhase === "max" ? "Finish" : "Next"}
          </Button>
        </div>
      {/if}
    </div>
  {/if}
</div>
