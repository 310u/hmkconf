import type { HMK_JoystickConfig, HMK_JoystickState } from "$lib/libhmk/commands/joystick"
import type {
  HostGamepadState,
  HostStickMode,
} from "./joystick-host-gamepad"
import type { JoystickCalibrationCandidate, JoystickVector } from "./joystick-diagnostics"

export const DIAGNOSTIC_EXPORT_POINT_LIMIT = 60
export const LINUX_JOYDEV_PREDICTION_ASSUMPTION =
  "Default Linux joydev correction without a jscal override."
export const LINUX_JOYDEV_PREDICTION_ROLE =
  "Reference only for the default Linux joydev path. Ignores jscal overrides; measured host capture is authoritative when available."

export type CircularityReport = {
  score: number
  label: string
  sampleCount: number
  outerSampleCount: number
  quadrantCoverage: number
  meanRadius: number
  radiusSpread: number
  axisRatio: number
  sufficient: boolean
}

type DiagnosticPoint = {
  x: number
  y: number
}

type BuildJoystickDiagnosticLogParams = {
  keyboard: {
    name: string
    id: string
    firmwareVersion: number
    firmwareVersionLabel: string
    profile: number
  }
  transport: {
    xInputEnabled: boolean | null
    activeGamepadTransport: string
    joystickModeReadyForGamepadValidation: boolean
    hostGamepadBackend: string
    hostGamepadState: HostGamepadState
    hostGamepadCircularity: CircularityReport
    predictedLinuxJoydevCircularity: CircularityReport
    linuxMeasuredVsOutDelta: number | null
    linuxMeasuredVsPredictedJoydevDelta: number | null
    linuxMeasurementInterpretation: string | null
    hostGamepadPoints: JoystickVector[]
  }
  joystick: {
    mode: {
      value: number
      label: string
    }
    configReadbackVerified: boolean | null
    selectedProfile: number
    runtimeProfile: number | null
    diagnosticProfile: number
    config: HMK_JoystickConfig
    diagnosticConfig: HMK_JoystickConfig | null
    latestState: HMK_JoystickState | null
  }
  diagnostics: {
    live: {
      rawCircularity: CircularityReport
      calibratedCircularity: CircularityReport | null
      correctedCircularity: CircularityReport | null
      outCircularity: CircularityReport
      referenceOutCircularity: CircularityReport
      predictedLinuxHostCircularity: CircularityReport
      linuxMeasuredVsOutDelta: number | null
      linuxMeasuredVsPredictedDelta: number | null
      linuxHostInterpretation: string | null
      rawPoints: DiagnosticPoint[]
      calibratedPoints: DiagnosticPoint[]
      correctedPoints: DiagnosticPoint[]
      outPoints: DiagnosticPoint[]
      referenceOutPoints: DiagnosticPoint[]
      predictedLinuxHostPoints: DiagnosticPoint[]
    }
    freshCapture: {
      phase: "idle" | "armed" | "capturing" | "complete"
      sampleCount: number
      rawCircularity: CircularityReport
      calibratedCircularity: CircularityReport | null
      correctedCircularity: CircularityReport | null
      outCircularity: CircularityReport
      referenceOutCircularity: CircularityReport
      predictedLinuxHostCircularity: CircularityReport
      hostCircularity: CircularityReport
      linuxMeasuredVsOutDelta: number | null
      linuxMeasuredVsPredictedDelta: number | null
      linuxHostInterpretation: string | null
      rawPoints: DiagnosticPoint[]
      calibratedPoints: DiagnosticPoint[]
      correctedPoints: DiagnosticPoint[]
      outPoints: DiagnosticPoint[]
      referenceOutPoints: DiagnosticPoint[]
      predictedLinuxHostPoints: DiagnosticPoint[]
      hostPoints: DiagnosticPoint[]
    }
    calibration: {
      phase: "idle" | "rest" | "max"
      previousMode: number | null
      centerSampleCount: number
      centerAssessment: {
        stable: boolean
        x: {
          center: number
          spread: number
          sampleCount: number
          stable: boolean
        }
        y: {
          center: number
          spread: number
          sampleCount: number
          stable: boolean
        }
      }
      sweepSampleCount: number
      sweepBounds: {
        minX: number
        maxX: number
        minY: number
        maxY: number
      }
      sweepCircularity: CircularityReport
      sweepOutputCircularity: CircularityReport
      displayedSweepCalibration: JoystickCalibrationCandidate | null
      sweepRawSamples: Array<{ x: number; y: number }>
      correctedSweepPoints: DiagnosticPoint[]
      correctedSweepOutputPoints: DiagnosticPoint[]
    }
  }
  guidance: {
    currentGamepadTransport: string
    supportsHostTransportComparison: boolean
    isLinuxHost: boolean
    freshLinuxHostInterpretation: string
  }
}

export function roundValue(value: number, digits = 2) {
  return Number(value.toFixed(digits))
}

export function serializePoint(point: DiagnosticPoint) {
  return {
    x: roundValue(point.x),
    y: roundValue(point.y),
  }
}

export function serializeAxes(values: number[]) {
  return values.map((value) => roundValue(value, 4))
}

export function serializeCircularity(report: CircularityReport) {
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

export function circularityScoreDelta(
  measured: CircularityReport,
  reference: CircularityReport,
) {
  return roundValue(Math.abs(measured.score - reference.score))
}

export function describeLinuxHostPrediction(
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

function serializePointTail(points: DiagnosticPoint[]) {
  return points
    .slice(-DIAGNOSTIC_EXPORT_POINT_LIMIT)
    .map((point) => serializePoint(point))
}

function sampledStickSummary(sampledStick: HostStickMode) {
  return sampledStick
}

export function buildJoystickDiagnosticLog(
  params: BuildJoystickDiagnosticLogParams,
) {
  const {
    keyboard,
    transport,
    joystick,
    diagnostics,
    guidance,
  } = params

  return {
    generatedAt: new Date().toISOString(),
    source: "hmkconf joystick tab",
    keyboard,
    transport: {
      xInputEnabled: transport.xInputEnabled,
      activeGamepadTransport: transport.activeGamepadTransport,
      joystickModeReadyForGamepadValidation:
        transport.joystickModeReadyForGamepadValidation,
      hostGamepad: {
        backend: transport.hostGamepadBackend,
        available: transport.hostGamepadState.available,
        connected: transport.hostGamepadState.connected,
        index: transport.hostGamepadState.index,
        id: transport.hostGamepadState.id,
        mapping: transport.hostGamepadState.mapping,
        sampledStick: sampledStickSummary(
          transport.hostGamepadState.sampledStick,
        ),
        axisPair: transport.hostGamepadState.axisPair,
        rawAxes: serializeAxes(transport.hostGamepadState.rawAxes),
        magnitude: roundValue(transport.hostGamepadState.magnitude),
        candidates: transport.hostGamepadState.candidates.map((candidate) => ({
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
        circularity: serializeCircularity(transport.hostGamepadCircularity),
        predictedLinuxJoydevAssumption: LINUX_JOYDEV_PREDICTION_ASSUMPTION,
        predictedLinuxJoydevRole: LINUX_JOYDEV_PREDICTION_ROLE,
        predictedLinuxJoydevCircularity: serializeCircularity(
          transport.predictedLinuxJoydevCircularity,
        ),
        linuxMeasuredVsOutDelta: transport.linuxMeasuredVsOutDelta,
        linuxMeasuredVsPredictedJoydevDelta:
          transport.linuxMeasuredVsPredictedJoydevDelta,
        linuxMeasurementInterpretation: transport.linuxMeasurementInterpretation,
        pointsTail: serializePointTail(transport.hostGamepadPoints),
      },
    },
    joystick,
    diagnostics: {
      live: {
        rawCircularity: serializeCircularity(diagnostics.live.rawCircularity),
        calibratedCircularity: diagnostics.live.calibratedCircularity
          ? serializeCircularity(diagnostics.live.calibratedCircularity)
          : null,
        correctedCircularity: diagnostics.live.correctedCircularity
          ? serializeCircularity(diagnostics.live.correctedCircularity)
          : null,
        outCircularity: serializeCircularity(diagnostics.live.outCircularity),
        referenceOutCircularity: serializeCircularity(
          diagnostics.live.referenceOutCircularity,
        ),
        predictedLinuxHostAssumption: LINUX_JOYDEV_PREDICTION_ASSUMPTION,
        predictedLinuxHostRole: LINUX_JOYDEV_PREDICTION_ROLE,
        predictedLinuxHostCircularity: serializeCircularity(
          diagnostics.live.predictedLinuxHostCircularity,
        ),
        linuxMeasuredVsOutDelta: diagnostics.live.linuxMeasuredVsOutDelta,
        linuxMeasuredVsPredictedDelta:
          diagnostics.live.linuxMeasuredVsPredictedDelta,
        linuxHostInterpretation: diagnostics.live.linuxHostInterpretation,
        rawPointsTail: serializePointTail(diagnostics.live.rawPoints),
        calibratedPointsTail: serializePointTail(
          diagnostics.live.calibratedPoints,
        ),
        correctedPointsTail: serializePointTail(
          diagnostics.live.correctedPoints,
        ),
        outPointsTail: serializePointTail(diagnostics.live.outPoints),
        referenceOutPointsTail: serializePointTail(
          diagnostics.live.referenceOutPoints,
        ),
        predictedLinuxHostPointsTail: serializePointTail(
          diagnostics.live.predictedLinuxHostPoints,
        ),
      },
      freshCapture: {
        phase: diagnostics.freshCapture.phase,
        sampleCount: diagnostics.freshCapture.sampleCount,
        rawCircularity: serializeCircularity(
          diagnostics.freshCapture.rawCircularity,
        ),
        calibratedCircularity: diagnostics.freshCapture.calibratedCircularity
          ? serializeCircularity(diagnostics.freshCapture.calibratedCircularity)
          : null,
        correctedCircularity: diagnostics.freshCapture.correctedCircularity
          ? serializeCircularity(diagnostics.freshCapture.correctedCircularity)
          : null,
        outCircularity: serializeCircularity(
          diagnostics.freshCapture.outCircularity,
        ),
        referenceOutCircularity: serializeCircularity(
          diagnostics.freshCapture.referenceOutCircularity,
        ),
        predictedLinuxHostAssumption: LINUX_JOYDEV_PREDICTION_ASSUMPTION,
        predictedLinuxHostRole: LINUX_JOYDEV_PREDICTION_ROLE,
        predictedLinuxHostCircularity: serializeCircularity(
          diagnostics.freshCapture.predictedLinuxHostCircularity,
        ),
        hostCircularity: serializeCircularity(
          diagnostics.freshCapture.hostCircularity,
        ),
        linuxMeasuredVsOutDelta:
          diagnostics.freshCapture.linuxMeasuredVsOutDelta,
        linuxMeasuredVsPredictedDelta:
          diagnostics.freshCapture.linuxMeasuredVsPredictedDelta,
        linuxHostInterpretation:
          diagnostics.freshCapture.linuxHostInterpretation,
        rawPointsTail: serializePointTail(diagnostics.freshCapture.rawPoints),
        calibratedPointsTail: serializePointTail(
          diagnostics.freshCapture.calibratedPoints,
        ),
        correctedPointsTail: serializePointTail(
          diagnostics.freshCapture.correctedPoints,
        ),
        outPointsTail: serializePointTail(diagnostics.freshCapture.outPoints),
        referenceOutPointsTail: serializePointTail(
          diagnostics.freshCapture.referenceOutPoints,
        ),
        predictedLinuxHostPointsTail: serializePointTail(
          diagnostics.freshCapture.predictedLinuxHostPoints,
        ),
        hostPointsTail: serializePointTail(diagnostics.freshCapture.hostPoints),
      },
      calibration: {
        phase: diagnostics.calibration.phase,
        previousMode: diagnostics.calibration.previousMode,
        centerSampleCount: diagnostics.calibration.centerSampleCount,
        centerAssessment: diagnostics.calibration.centerAssessment,
        sweepSampleCount: diagnostics.calibration.sweepSampleCount,
        sweepBounds: diagnostics.calibration.sweepBounds,
        sweepCircularity: serializeCircularity(
          diagnostics.calibration.sweepCircularity,
        ),
        sweepOutputCircularity: serializeCircularity(
          diagnostics.calibration.sweepOutputCircularity,
        ),
        displayedSweepCalibration:
          diagnostics.calibration.displayedSweepCalibration,
        sweepRawSamples: diagnostics.calibration.sweepRawSamples,
        correctedSweepPointsTail: serializePointTail(
          diagnostics.calibration.correctedSweepPoints,
        ),
        correctedSweepOutputPointsTail: serializePointTail(
          diagnostics.calibration.correctedSweepOutputPoints,
        ),
      },
    },
    guidance: [
      "If RAW circularity is poor, the issue is likely sensor or mechanics before firmware output.",
      "If RAW is good and OUT is poor, the issue is likely firmware circular correction or deadzone behavior.",
      `Current gamepad transport is ${guidance.currentGamepadTransport}.`,
      guidance.supportsHostTransportComparison
        ? "For host-side comparison, switch the joystick mode to XInput Left Stick or Right Stick, then test the same sweep twice: once with XInput enabled and once with XInput disabled."
        : "On Linux, Chromium/Electron reads Gamepad API axes through joydev rather than raw evdev/HID values. Use firmware OUT to validate the correction path, then use measured host capture as the real Linux browser result.",
      "Predicted Linux host circularity is a default joydev reference only. It ignores jscal overrides; when measured host capture is available, trust that measured host score instead.",
      ...(guidance.isLinuxHost
        ? [`Linux comparison summary: ${guidance.freshLinuxHostInterpretation}`]
        : []),
    ],
  }
}
