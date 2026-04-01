import type { Keyboard } from "$lib/keyboard"
import type { HMK_Options } from "$lib/libhmk"
import {
  HMK_JOYSTICK_MOUSE_PRESET_FIRMWARE_VERSION,
  HMK_JOYSTICK_SCROLL_PROFILE_FIRMWARE_VERSION,
  type HMK_JoystickConfig,
  type HMK_JoystickMousePreset,
  type HMK_JoystickState,
} from "$lib/libhmk/commands/joystick"
import { displayVersion } from "$lib/utils"
import { untrack } from "svelte"
import { toast } from "svelte-sonner"
import {
  buildSelectedMousePresetConfig,
  buildUpdatedActiveMousePresetConfig,
  getJoystickModeLabel,
  JOYSTICK_MODE_OPTIONS,
  JOYSTICK_SCROLL_PROFILE_OPTIONS,
  persistJoystickConfigToKeyboard,
  persistSharedCalibrationToKeyboard,
} from "./joystick-config"
import {
  buildJoystickDiagnosticLog,
  circularityScoreDelta,
  describeLinuxHostPrediction,
  roundValue,
} from "./joystick-diagnostic-log"
import {
  applyJoystickCircularCorrection,
  applyJoystickRadialDeadzone,
  assessJoystickRestSamples,
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
import {
  supportsHostTransportComparison as canCompareHostTransport,
  getCurrentGamepadTransport as describeCurrentGamepadTransport,
  getFreshCaptureStatus as describeFreshCaptureStatus,
  getFreshHostSubtitle as describeFreshHostSubtitle,
  getGamepadHostValidationMode as describeGamepadHostValidationMode,
  getHostCircularitySubtitle as describeHostCircularitySubtitle,
  getHostGamepadBackend as describeHostGamepadBackend,
  getHostGamepadStatus as describeHostGamepadStatus,
  getTransportValidationAdvice as describeTransportValidationAdvice,
  circularityTone as getCircularityToneClass,
  detectLinuxHost as isLinuxUserAgent,
} from "./joystick-diagnostics-status"
import {
  buildHostGamepadState,
  createEmptyHostGamepadState,
  currentHostStickMode,
  detectHostGamepadAxisPair,
  type HostGamepadState,
} from "./joystick-host-gamepad"

const JOYSTICK_STATE_POLL_INTERVAL = 1000 / 60
const LIVE_SAMPLE_LIMIT = 360
const SWEEP_SAMPLE_LIMIT = 720
const FRESH_CAPTURE_MAX_SAMPLES = 300
const FRESH_CAPTURE_START_THRESHOLD = 24

type CreateJoystickTabControllerParams = {
  keyboard: Keyboard
  getProfile: () => number
  getTab: () => string
}

export function createJoystickTabController(
  params: CreateJoystickTabControllerParams,
) {
  const { keyboard, getProfile, getTab } = params

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
  let hostGamepadState = $state<HostGamepadState>(
    createEmptyHostGamepadState(false),
  )

  const modes = JOYSTICK_MODE_OPTIONS
  const scrollProfiles = JOYSTICK_SCROLL_PROFILE_OPTIONS

  const supportsJoystickMousePresets = $derived.by(
    () => keyboard.version >= HMK_JOYSTICK_MOUSE_PRESET_FIRMWARE_VERSION,
  )
  const supportsJoystickScrollProfiles = $derived.by(
    () => keyboard.version >= HMK_JOYSTICK_SCROLL_PROFILE_FIRMWARE_VERSION,
  )

  let centerSamplesX = $state<number[]>([])
  let centerSamplesY = $state<number[]>([])
  let minX = $state(4095)
  let maxX = $state(0)
  let minY = $state(4095)
  let maxY = $state(0)

  $effect(() => {
    const tab = getTab()
    if (tab !== "joystick") return

    const profile = getProfile()

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
    hostGamepadState = createEmptyHostGamepadState(
      typeof navigator !== "undefined" && !!navigator.getGamepads,
    )
    let active = true
    let pollTimeout: number | null = null
    let joystickPollInFlight = false

    keyboard
      .getJoystickConfig?.({ profile })
      .then((currentConfig) => {
        if (!active) return
        config = currentConfig
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
    const tab = getTab()
    if (tab !== "joystick" || !keyboard.getJoystickConfig) return

    const profile = getProfile()
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
      .then((nextRuntimeConfig) => {
        if (cancelled) return
        runtimeProfileConfig = nextRuntimeConfig
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

    const profile = getProfile()
    const diagnosticConfig =
      joystickState.profile !== profile &&
      runtimeProfileConfigProfile === joystickState.profile &&
      runtimeProfileConfig
        ? runtimeProfileConfig
        : config

    if (!diagnosticConfig) return

    const sample = buildJoystickDiagnosticSample(
      joystickState,
      diagnosticConfig,
    )

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

  const liveRawPoints = $derived.by(() =>
    liveSamples.map((sample) => sample.raw),
  )
  const liveOutPoints = $derived.by(() =>
    liveSamples.map((sample) => sample.out),
  )
  const diagnosticConfig = $derived.by(() => {
    const profile = getProfile()
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
    const profile = getProfile()
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
    diagnosticConfig
      ? liveRawPoints.map((point) => predictFirmwareOutput(point))
      : [],
  )
  const livePredictedLinuxHostPoints = $derived.by(() =>
    liveReferenceOutPoints.map((point) =>
      predictLinuxJoydevGamepadPoint(point),
    ),
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
    freshLiveSamples.flatMap((sample) =>
      sample.corrected ? [sample.corrected] : [],
    ),
  )
  const freshOutPoints = $derived.by(() =>
    freshLiveSamples.map((sample) => sample.out),
  )
  const freshReferenceOutPoints = $derived.by(() =>
    diagnosticConfig
      ? freshRawPoints.map((point) => predictFirmwareOutput(point))
      : [],
  )
  const freshPredictedLinuxHostPoints = $derived.by(() =>
    freshReferenceOutPoints.map((point) =>
      predictLinuxJoydevGamepadPoint(point),
    ),
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
    liveSamples.flatMap((sample) =>
      sample.calibrated ? [sample.calibrated] : [],
    ),
  )
  const liveCorrectedPoints = $derived.by(() =>
    liveSamples.flatMap((sample) =>
      sample.corrected ? [sample.corrected] : [],
    ),
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
    const currentConfig = config
    if (!currentConfig) return []

    return displayedSweepPoints.map((point) =>
      applyJoystickRadialDeadzone(point, currentConfig.deadzone),
    )
  })
  const sweepCircularity = $derived.by(() =>
    computeJoystickCircularity(displayedSweepPoints),
  )
  const sweepOutputCircularity = $derived.by(() =>
    computeJoystickCircularity(displayedSweepOutputPoints),
  )
  const isLinuxHost = $derived.by(() =>
    isLinuxUserAgent(
      typeof navigator === "undefined" ? null : navigator.userAgent,
    ),
  )
  const hostGamepadBackend = $derived.by(() =>
    describeHostGamepadBackend(
      typeof navigator !== "undefined" && !!navigator.getGamepads,
      isLinuxHost,
    ),
  )
  const currentGamepadTransport = $derived.by(() =>
    describeCurrentGamepadTransport(options),
  )
  const supportsHostTransportComparison = $derived.by(() =>
    canCompareHostTransport(typeof navigator !== "undefined", isLinuxHost),
  )
  const gamepadHostValidationMode = $derived.by(() =>
    describeGamepadHostValidationMode(
      config?.mode ?? null,
      supportsHostTransportComparison,
    ),
  )
  const transportValidationAdvice = $derived.by(() =>
    describeTransportValidationAdvice(supportsHostTransportComparison),
  )
  const hostGamepadStatus = $derived.by(() =>
    describeHostGamepadStatus(hostGamepadState),
  )
  const freshCaptureStatus = $derived.by(() =>
    describeFreshCaptureStatus(freshCapturePhase, freshLiveSamples.length),
  )
  const hostCircularitySubtitle = $derived.by(() =>
    describeHostCircularitySubtitle(supportsHostTransportComparison),
  )
  const freshHostSubtitle = $derived.by(() =>
    describeFreshHostSubtitle(supportsHostTransportComparison),
  )
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
    await persistJoystickConfig(
      buildUpdatedActiveMousePresetConfig(
        config,
        nextPreset,
        supportsJoystickMousePresets,
      ),
    )
  }

  async function selectMousePreset(index: number) {
    if (!config || !supportsJoystickMousePresets) return
    await persistJoystickConfig(buildSelectedMousePresetConfig(config, index))
  }

  async function persistJoystickConfig(updated: HMK_JoystickConfig) {
    if (!config) return

    const profile = getProfile()
    const previous = config
    config = updated
    configReadbackVerified = null

    try {
      const result = await persistJoystickConfigToKeyboard({
        keyboard,
        profile,
        updated,
        supportsJoystickMousePresets,
      })
      config = result.persisted
      configReadbackVerified = result.configReadbackVerified
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

    const profile = getProfile()
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
      if (runtimeProfile !== profile) {
        runtimeProfileConfigPending = runtimeProfile
      }

      const result = await persistSharedCalibrationToKeyboard({
        keyboard,
        profile,
        selectedConfig: config,
        candidate,
        restoredMode,
        runtimeProfile,
        supportsJoystickMousePresets,
      })
      config = result.persisted
      configReadbackVerified = result.configReadbackVerified
      runtimeProfileConfig = result.runtimeProfileConfig
      runtimeProfileConfigProfile = result.runtimeProfileConfigProfile
      runtimeProfileConfigPending = null
    } catch (error) {
      config = previousConfig
      runtimeProfileConfig = previousRuntimeProfileConfig
      runtimeProfileConfigProfile = previousRuntimeProfileConfigProfile
      runtimeProfileConfigPending = previousRuntimeProfileConfigPending
      configReadbackVerified = false
      throw error
    }
  }

  function pollHostGamepad() {
    const available =
      typeof navigator !== "undefined" && !!navigator.getGamepads
    if (!available) {
      hostGamepadState = createEmptyHostGamepadState(false)
      return
    }

    hostGamepadState = buildHostGamepadState(navigator.getGamepads(), {
      sampledStick: currentHostStickMode(config?.mode ?? null),
      previousIndex: hostGamepadState.index,
      detectedAxisPair: detectedHostGamepadAxisPair,
    })
  }

  function buildDiagnosticLog() {
    if (!config) return null

    const profile = getProfile()

    return buildJoystickDiagnosticLog({
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
        hostGamepadBackend,
        hostGamepadState,
        hostGamepadCircularity,
        predictedLinuxJoydevCircularity: livePredictedLinuxHostCircularity,
        linuxMeasuredVsOutDelta: isLinuxHost
          ? liveLinuxMeasuredVsOutDelta
          : null,
        linuxMeasuredVsPredictedJoydevDelta: isLinuxHost
          ? liveLinuxMeasuredVsPredictionDelta
          : null,
        linuxMeasurementInterpretation: isLinuxHost
          ? liveLinuxHostInterpretation
          : null,
        hostGamepadPoints,
      },
      joystick: {
        mode: {
          value: config.mode,
          label: getJoystickModeLabel(config.mode),
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
          rawCircularity: liveRawCircularity,
          calibratedCircularity: liveCalibratedPoints.length
            ? liveCalibratedCircularity
            : null,
          correctedCircularity: liveCorrectedPoints.length
            ? liveCorrectedCircularity
            : null,
          outCircularity: liveOutCircularity,
          referenceOutCircularity: liveReferenceOutCircularity,
          predictedLinuxHostCircularity: livePredictedLinuxHostCircularity,
          linuxMeasuredVsOutDelta: isLinuxHost
            ? liveLinuxMeasuredVsOutDelta
            : null,
          linuxMeasuredVsPredictedDelta: isLinuxHost
            ? liveLinuxMeasuredVsPredictionDelta
            : null,
          linuxHostInterpretation: isLinuxHost
            ? liveLinuxHostInterpretation
            : null,
          rawPoints: liveRawPoints,
          calibratedPoints: liveCalibratedPoints,
          correctedPoints: liveCorrectedPoints,
          outPoints: liveOutPoints,
          referenceOutPoints: liveReferenceOutPoints,
          predictedLinuxHostPoints: livePredictedLinuxHostPoints,
        },
        freshCapture: {
          phase: freshCapturePhase,
          sampleCount: freshLiveSamples.length,
          rawCircularity: freshRawCircularity,
          calibratedCircularity: freshCalibratedPoints.length
            ? freshCalibratedCircularity
            : null,
          correctedCircularity: freshCorrectedPoints.length
            ? freshCorrectedCircularity
            : null,
          outCircularity: freshOutCircularity,
          referenceOutCircularity: freshReferenceOutCircularity,
          predictedLinuxHostCircularity: freshPredictedLinuxHostCircularity,
          hostCircularity: freshHostCircularity,
          linuxMeasuredVsOutDelta: isLinuxHost
            ? freshLinuxMeasuredVsOutDelta
            : null,
          linuxMeasuredVsPredictedDelta: isLinuxHost
            ? freshLinuxMeasuredVsPredictionDelta
            : null,
          linuxHostInterpretation: isLinuxHost
            ? freshLinuxHostInterpretation
            : null,
          rawPoints: freshRawPoints,
          calibratedPoints: freshCalibratedPoints,
          correctedPoints: freshCorrectedPoints,
          outPoints: freshOutPoints,
          referenceOutPoints: freshReferenceOutPoints,
          predictedLinuxHostPoints: freshPredictedLinuxHostPoints,
          hostPoints: freshHostPoints,
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
          sweepCircularity,
          sweepOutputCircularity,
          displayedSweepCalibration,
          sweepRawSamples: displayedSweepRawSamples,
          correctedSweepPoints: displayedSweepPoints,
          correctedSweepOutputPoints: displayedSweepOutputPoints,
        },
      },
      guidance: {
        currentGamepadTransport,
        supportsHostTransportComparison,
        isLinuxHost,
        freshLinuxHostInterpretation,
      },
    })
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

  return {
    get loading() {
      return loading
    },
    get config() {
      return config
    },
    get modes() {
      return modes
    },
    get scrollProfiles() {
      return scrollProfiles
    },
    get supportsJoystickMousePresets() {
      return supportsJoystickMousePresets
    },
    get supportsJoystickScrollProfiles() {
      return supportsJoystickScrollProfiles
    },
    get joystickState() {
      return joystickState
    },
    get currentReferenceOut() {
      return currentReferenceOut
    },
    get liveRawPoints() {
      return liveRawPoints
    },
    get liveOutPoints() {
      return liveOutPoints
    },
    get liveReferenceOutPoints() {
      return liveReferenceOutPoints
    },
    get liveRawCircularity() {
      return liveRawCircularity
    },
    get liveOutCircularity() {
      return liveOutCircularity
    },
    get liveReferenceOutCircularity() {
      return liveReferenceOutCircularity
    },
    get sweepCircularity() {
      return sweepCircularity
    },
    get freshCapturePhase() {
      return freshCapturePhase
    },
    get freshCaptureStatus() {
      return freshCaptureStatus
    },
    get freshRawCircularity() {
      return freshRawCircularity
    },
    get freshOutCircularity() {
      return freshOutCircularity
    },
    get freshHostCircularity() {
      return freshHostCircularity
    },
    get freshLiveSampleCount() {
      return freshLiveSamples.length
    },
    get freshHostSampleCount() {
      return freshHostGamepadSamples.length
    },
    get freshHostSubtitle() {
      return freshHostSubtitle
    },
    get calibrationPhase() {
      return calibrationPhase
    },
    get displayedSweepPoints() {
      return displayedSweepPoints
    },
    get transportValidationAdvice() {
      return transportValidationAdvice
    },
    get currentGamepadTransport() {
      return currentGamepadTransport
    },
    get hostGamepadBackend() {
      return hostGamepadBackend
    },
    get isLinuxHost() {
      return isLinuxHost
    },
    get hostGamepadCircularity() {
      return hostGamepadCircularity
    },
    get liveLinuxHostInterpretation() {
      return liveLinuxHostInterpretation
    },
    get livePredictedLinuxHostCircularity() {
      return livePredictedLinuxHostCircularity
    },
    get gamepadHostValidationMode() {
      return gamepadHostValidationMode
    },
    get hostGamepadStatus() {
      return hostGamepadStatus
    },
    get hostGamepadPoints() {
      return hostGamepadPoints
    },
    get hostCircularitySubtitle() {
      return hostCircularitySubtitle
    },
    get hostGamepadState() {
      return hostGamepadState
    },
    circularityTone: getCircularityToneClass,
    updateConfig,
    updateActiveMousePreset,
    selectMousePreset,
    startFreshCapture,
    cancelFreshCapture,
    stopFreshCapture,
    resetLiveDiagnostics,
    copyDiagnosticLog,
    startCalibration,
    cancelCalibration,
    nextCalibrationStep,
  }
}

export type JoystickTabController = ReturnType<
  typeof createJoystickTabController
>
