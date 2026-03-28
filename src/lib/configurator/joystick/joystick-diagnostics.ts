import type {
  HMK_JoystickAxisCalibration,
  HMK_JoystickConfig,
  HMK_JoystickState,
} from "$lib/libhmk/commands/joystick"
import {
  HMK_JOYSTICK_RADIAL_BOUNDARY_DEFAULT,
  HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS,
  makeDefaultJoystickRadialBoundaries,
} from "$lib/libhmk/commands/joystick"
import { clamp } from "$lib/utils"

export type JoystickVector = {
  x: number
  y: number
}

export type JoystickDiagnosticSample = {
  raw: JoystickVector
  out: JoystickVector
  calibrated?: JoystickVector
  corrected?: JoystickVector
}

export type JoystickDiagnosticRawSample = {
  x: number
  y: number
}

export type JoystickCalibrationCandidate = Pick<
  HMK_JoystickConfig,
  "x" | "y" | "radialBoundaries"
>

export type JoystickRestAxisAssessment = {
  center: number
  spread: number
  stable: boolean
  sampleCount: number
}

export type JoystickRestAssessment = {
  x: JoystickRestAxisAssessment
  y: JoystickRestAxisAssessment
  stable: boolean
}

export type JoystickCircularityReport = {
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

const ADC_CENTER_FALLBACK = 2048
const ADC_MIN_FALLBACK = 0
const ADC_MAX_FALLBACK = 4095
const CIRCULAR_TARGET_MAGNITUDE = 127
const MIN_OUTER_RADIUS = 24
const OUTER_RADIUS_RATIO = 0.6
const MIN_OUTER_SAMPLES = 16
const MIN_ENVELOPE_SECTORS = 12
const QUADRANT_THRESHOLD = 16
const FULL_CIRCLE_RADIANS = Math.PI * 2
const RADIAL_BOUNDARY_REFINEMENT_PASSES = 2
const CALIBRATION_ENVELOPE_PERCENTILE = 0.9
const CALIBRATION_ENVELOPE_MIN_SAMPLES = 6
const RADIAL_BOUNDARY_DESPIKE_PASSES = 2
const RADIAL_BOUNDARY_MAX_NEIGHBOR_DEVIATION = 12
const RADIAL_BOUNDARY_EXCESS_DAMPING = 0.5
const REST_CENTER_MIN_SAMPLES = 16
const REST_CENTER_MAX_SPREAD = 64
const RADIAL_BOUNDARY_TUNING_FOLDS = 4
const RADIAL_BOUNDARY_TUNING_MIN_SAMPLES = 128
const RADIAL_BOUNDARY_TUNING_PERCENTILES = [0.8, 0.84, 0.88, 0.9] as const
const RADIAL_BOUNDARY_TUNING_SHRINK_FACTORS = [
  0.84, 0.88, 0.92, 0.96, 1,
] as const
const AXIS_RANGE_TUNING_FACTORS = [
  0.86, 0.9, 0.94, 0.98, 1, 1.02, 1.04, 1.06,
] as const
const RADIAL_BOUNDARY_TUNING_HOLDOUT_WEIGHT = 0.9
const RADIAL_BOUNDARY_TUNING_FULL_WEIGHT = 0.1
const LINUX_JOYDEV_AXIS_MIN = -128
const LINUX_JOYDEV_AXIS_MAX = 127
const LINUX_JOYDEV_AXIS_OUTPUT_MAX = 32767

type RadialBoundaryBuildOptions = {
  calibrationPercentile?: number
  shrinkFactor?: number
}

type CalibrationOptimizationOptions = {
  calibrationPercentile: number
  shrinkFactor: number
  xRangeFactor: number
  yRangeFactor: number
}

function normalizeRawAxis(
  rawValue: number,
  calibration: HMK_JoystickAxisCalibration,
) {
  let center = calibration.center
  let min = calibration.min
  let max = calibration.max

  if (center === 0 || max === 0) {
    center = ADC_CENTER_FALLBACK
    min = ADC_MIN_FALLBACK
    max = ADC_MAX_FALLBACK
  }

  const distanceFromCenter = rawValue - center

  if (distanceFromCenter > 0) {
    const range = Math.max(1, max - center)
    return clamp((distanceFromCenter * 127) / range, [-128, 127])
  }

  const range = Math.max(1, center - min)
  return clamp((distanceFromCenter * 128) / range, [-128, 127])
}

function vectorRadius(point: JoystickVector) {
  return Math.hypot(point.x, point.y)
}

function normalizeAngle(angle: number) {
  return angle < 0 ? angle + FULL_CIRCLE_RADIANS : angle
}

function sectorFloat(point: JoystickVector) {
  return (
    (normalizeAngle(Math.atan2(point.y, point.x)) *
      HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS) /
    FULL_CIRCLE_RADIANS
  )
}

function boundarySample(boundaries: number[], index: number) {
  const value =
    boundaries[circularSectorIndex(index)] ??
    HMK_JOYSTICK_RADIAL_BOUNDARY_DEFAULT

  return value > 0 ? value : HMK_JOYSTICK_RADIAL_BOUNDARY_DEFAULT
}

function monotoneBoundaryTangent(
  previous: number,
  current: number,
  next: number,
) {
  const leftDelta = current - previous
  const rightDelta = next - current

  if (
    leftDelta === 0 ||
    rightDelta === 0 ||
    Math.sign(leftDelta) !== Math.sign(rightDelta)
  ) {
    return 0
  }

  return (2 * leftDelta * rightDelta) / (leftDelta + rightDelta)
}

function monotoneBoundaryInterpolate(
  previous: number,
  current: number,
  next: number,
  following: number,
  fraction: number,
) {
  if (fraction <= 0) {
    return current
  }

  if (fraction >= 1) {
    return next
  }

  const tangentCurrent = monotoneBoundaryTangent(previous, current, next)
  const tangentNext = monotoneBoundaryTangent(current, next, following)
  const fractionSquared = fraction * fraction
  const fractionCubed = fractionSquared * fraction
  const interpolated =
    (2 * fractionCubed - 3 * fractionSquared + 1) * current +
    (fractionCubed - 2 * fractionSquared + fraction) * tangentCurrent +
    (-2 * fractionCubed + 3 * fractionSquared) * next +
    (fractionCubed - fractionSquared) * tangentNext

  return clamp(interpolated, [Math.min(current, next), Math.max(current, next)])
}

function boundaryLookup(boundaries: number[], sector: number) {
  const lowerIndex = Math.floor(sector)
  const fraction = sector - Math.floor(sector)

  return monotoneBoundaryInterpolate(
    boundarySample(boundaries, lowerIndex - 1),
    boundarySample(boundaries, lowerIndex),
    boundarySample(boundaries, lowerIndex + 1),
    boundarySample(boundaries, lowerIndex + 2),
    fraction,
  )
}

function fillMissingRadialBoundaries(boundaries: number[], seen: boolean[]) {
  const filled = [...boundaries]
  if (!seen.some(Boolean)) {
    return filled
  }

  for (let i = 0; i < filled.length; i++) {
    if (seen[i]) continue

    let previous = i
    while (!seen[previous]) {
      previous =
        (previous - 1 + HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS) %
        HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS
    }

    let next = i
    while (!seen[next]) {
      next = (next + 1) % HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS
    }

    const previousDistance =
      (i - previous + HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS) %
      HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS
    const nextDistance =
      (next - i + HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS) %
      HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS
    const totalDistance = previousDistance + nextDistance

    if (totalDistance === 0) {
      filled[i] = filled[previous]
      continue
    }

    const previousWeight = nextDistance / totalDistance
    const nextWeight = previousDistance / totalDistance
    filled[i] = filled[previous] * previousWeight + filled[next] * nextWeight
  }

  return filled
}

function circularSectorIndex(index: number) {
  return (
    ((index % HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS) +
      HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS) %
    HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS
  )
}

function relaxRadialBoundarySpikes(boundaries: number[]) {
  let relaxed = [...boundaries]

  for (let pass = 0; pass < RADIAL_BOUNDARY_DESPIKE_PASSES; pass++) {
    relaxed = relaxed.map((boundary, index) => {
      const previous = relaxed[circularSectorIndex(index - 1)] ?? boundary
      const next = relaxed[circularSectorIndex(index + 1)] ?? boundary
      const neighborAverage = (previous + next) / 2
      const deviation = boundary - neighborAverage

      if (Math.abs(deviation) <= RADIAL_BOUNDARY_MAX_NEIGHBOR_DEVIATION) {
        return boundary
      }

      const limitedDeviation =
        Math.sign(deviation) *
        (RADIAL_BOUNDARY_MAX_NEIGHBOR_DEVIATION +
          (Math.abs(deviation) - RADIAL_BOUNDARY_MAX_NEIGHBOR_DEVIATION) *
            RADIAL_BOUNDARY_EXCESS_DAMPING)

      return neighborAverage + limitedDeviation
    })
  }

  return relaxed
}

function sampleQuantile(sortedSamples: number[], ratio: number) {
  if (sortedSamples.length === 0) {
    return 0
  }

  const index = clamp(Math.round((sortedSamples.length - 1) * ratio), [
    0,
    sortedSamples.length - 1,
  ])
  return sortedSamples[index]
}

function assessRestAxisSamples(samples: number[]): JoystickRestAxisAssessment {
  if (samples.length === 0) {
    return {
      center: ADC_CENTER_FALLBACK,
      spread: 0,
      stable: false,
      sampleCount: 0,
    }
  }

  const sorted = [...samples].sort((left, right) => left - right)
  const center = Math.round(sampleQuantile(sorted, 0.5))
  const spread = sampleQuantile(sorted, 0.9) - sampleQuantile(sorted, 0.1)

  return {
    center,
    spread,
    stable:
      samples.length >= REST_CENTER_MIN_SAMPLES &&
      spread <= REST_CENTER_MAX_SPREAD,
    sampleCount: samples.length,
  }
}

export function assessJoystickRestSamples(
  centerSamplesX: number[],
  centerSamplesY: number[],
): JoystickRestAssessment {
  const x = assessRestAxisSamples(centerSamplesX)
  const y = assessRestAxisSamples(centerSamplesY)

  return {
    x,
    y,
    stable: x.stable && y.stable,
  }
}

function shrinkRadialBoundaries(boundaries: number[], shrinkFactor: number) {
  if (!Number.isFinite(shrinkFactor) || shrinkFactor === 1) {
    return [...boundaries]
  }

  return boundaries.map(
    (boundary) =>
      HMK_JOYSTICK_RADIAL_BOUNDARY_DEFAULT +
      (boundary - HMK_JOYSTICK_RADIAL_BOUNDARY_DEFAULT) * shrinkFactor,
  )
}

export function normalizeRawPoint(
  sample: JoystickDiagnosticRawSample,
  calibration: Pick<JoystickCalibrationCandidate, "x" | "y">,
): JoystickVector {
  return {
    x: normalizeRawAxis(sample.x, calibration.x),
    y: normalizeRawAxis(sample.y, calibration.y),
  }
}

export function applyJoystickCircularCorrection(
  point: JoystickVector,
  radialBoundaries: number[],
): JoystickVector {
  const radius = vectorRadius(point)
  if (radius === 0) {
    return { x: 0, y: 0 }
  }

  const observedBoundary = boundaryLookup(radialBoundaries, sectorFloat(point))
  if (observedBoundary <= 0) {
    return point
  }

  const scale = CIRCULAR_TARGET_MAGNITUDE / observedBoundary
  return {
    x: clamp(Math.round(point.x * scale), [-128, 127]),
    y: clamp(Math.round(point.y * scale), [-128, 127]),
  }
}

export function applyJoystickRadialDeadzone(
  point: JoystickVector,
  deadzone: number,
): JoystickVector {
  const radius = vectorRadius(point)
  if (radius === 0) {
    return { x: 0, y: 0 }
  }

  if (deadzone >= 255) {
    return { x: 0, y: 0 }
  }

  const magnitudeNorm = clamp(
    (radius * 255) / CIRCULAR_TARGET_MAGNITUDE,
    [0, 255],
  )
  if (magnitudeNorm <= deadzone) {
    return { x: 0, y: 0 }
  }

  const scaledNorm = ((magnitudeNorm - deadzone) * 255) / (255 - deadzone)
  const scale = scaledNorm / magnitudeNorm

  return {
    x: clamp(Math.round(point.x * scale), [-128, 127]),
    y: clamp(Math.round(point.y * scale), [-128, 127]),
  }
}

function applyLinuxJoydevAxisCorrection(
  value: number,
  minimum = LINUX_JOYDEV_AXIS_MIN,
  maximum = LINUX_JOYDEV_AXIS_MAX,
) {
  const quantized = clamp(Math.round(value), [minimum, maximum])
  const flat = Math.trunc((maximum - minimum) / 16)
  const center = Math.trunc((maximum + minimum) / 2)
  const lowerDeadzoneEdge = center - flat
  const upperDeadzoneEdge = center + flat
  const span = Math.trunc((maximum - minimum) / 2) - 2 * flat

  if (span <= 0) {
    return 0
  }

  const coefficient = Math.trunc((1 << 29) / span)
  let corrected = 0

  if (quantized > lowerDeadzoneEdge) {
    if (quantized >= upperDeadzoneEdge) {
      corrected = (coefficient * (quantized - upperDeadzoneEdge)) >> 14
    }
  } else {
    corrected = (coefficient * (quantized - lowerDeadzoneEdge)) >> 14
  }

  return clamp(corrected, [
    -LINUX_JOYDEV_AXIS_OUTPUT_MAX,
    LINUX_JOYDEV_AXIS_OUTPUT_MAX,
  ])
}

export function predictLinuxJoydevGamepadPoint(
  point: JoystickVector,
): JoystickVector {
  return {
    x:
      (applyLinuxJoydevAxisCorrection(point.x) * CIRCULAR_TARGET_MAGNITUDE) /
      LINUX_JOYDEV_AXIS_OUTPUT_MAX,
    y:
      (applyLinuxJoydevAxisCorrection(point.y) * CIRCULAR_TARGET_MAGNITUDE) /
      LINUX_JOYDEV_AXIS_OUTPUT_MAX,
  }
}

export function buildRadialBoundaries(
  points: JoystickVector[],
  options: RadialBoundaryBuildOptions = {},
) {
  const calibrationPercentile =
    options.calibrationPercentile ?? CALIBRATION_ENVELOPE_PERCENTILE
  const shrinkFactor = options.shrinkFactor ?? 1

  const { boundaries, seen } = collectCalibrationEnvelope(
    points,
    calibrationPercentile,
  )

  if (!seen.some(Boolean)) {
    return makeDefaultJoystickRadialBoundaries()
  }

  const initialBoundaries = relaxRadialBoundarySpikes(
    fillMissingRadialBoundaries(boundaries, seen),
  )
  const refinedBoundaries = refineRadialBoundaries(points, initialBoundaries)

  const despikedBoundaries = relaxRadialBoundarySpikes(refinedBoundaries)
  const shrunkBoundaries = shrinkRadialBoundaries(
    despikedBoundaries,
    shrinkFactor,
  )

  return relaxRadialBoundarySpikes(shrunkBoundaries).map((boundary) =>
    clamp(Math.round(boundary), [1, 255]),
  )
}

function collectRadialEnvelope(points: JoystickVector[]) {
  const boundaries = Array.from(
    { length: HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS },
    () => 0,
  )
  const seen = Array.from(
    { length: HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS },
    () => false,
  )

  for (const point of points) {
    const radius = vectorRadius(point)
    if (radius < MIN_OUTER_RADIUS) continue

    const sector =
      Math.round(sectorFloat(point)) % HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS
    boundaries[sector] = Math.max(boundaries[sector], radius)
    seen[sector] = true
  }

  return {
    boundaries,
    seen,
    seenCount: seen.filter(Boolean).length,
  }
}

function refineRadialBoundaries(
  points: JoystickVector[],
  boundaries: number[],
) {
  let refined = [...boundaries]

  for (let pass = 0; pass < RADIAL_BOUNDARY_REFINEMENT_PASSES; pass++) {
    const correctedPoints = points.map((point) =>
      applyJoystickCircularCorrection(point, refined),
    )
    const residualEnvelope = collectCalibrationEnvelope(
      correctedPoints,
      CALIBRATION_ENVELOPE_PERCENTILE,
    )

    if (!residualEnvelope.seen.some(Boolean)) {
      break
    }

    const residualBoundaries = fillMissingRadialBoundaries(
      residualEnvelope.boundaries,
      residualEnvelope.seen,
    )

    refined = refined.map((boundary, index) => {
      const residual = residualBoundaries[index]
      if (!Number.isFinite(residual) || residual <= 0) {
        return boundary
      }

      return clamp((boundary * residual) / CIRCULAR_TARGET_MAGNITUDE, [1, 255])
    })

    refined = relaxRadialBoundarySpikes(refined)
  }

  return refined
}

function collectCalibrationEnvelope(
  points: JoystickVector[],
  calibrationPercentile: number,
) {
  const buckets = Array.from(
    { length: HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS },
    () => [] as number[],
  )
  const seen = Array.from(
    { length: HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS },
    () => false,
  )

  for (const point of points) {
    const radius = vectorRadius(point)
    if (radius < MIN_OUTER_RADIUS) continue

    const sector =
      Math.round(sectorFloat(point)) % HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS
    buckets[sector].push(radius)
    seen[sector] = true
  }

  const boundaries = buckets.map((bucket) => {
    if (bucket.length === 0) {
      return 0
    }

    if (bucket.length < CALIBRATION_ENVELOPE_MIN_SAMPLES) {
      return Math.max(...bucket)
    }

    const sorted = [...bucket].sort((left, right) => left - right)
    const percentileIndex = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil(sorted.length * calibrationPercentile) - 1),
    )

    return sorted[percentileIndex]
  })

  return {
    boundaries,
    seen,
    seenCount: seen.filter(Boolean).length,
  }
}

function envelopeAxisRatio(boundaries: number[]) {
  const envelopePoints = boundaries.map((radius, index) => {
    const angle =
      ((index + 0.5) * FULL_CIRCLE_RADIANS) /
      HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    }
  })

  const xs = envelopePoints.map((point) => point.x)
  const ys = envelopePoints.map((point) => point.y)
  const xRange = Math.max(...xs) - Math.min(...xs)
  const yRange = Math.max(...ys) - Math.min(...ys)
  const longestAxis = Math.max(xRange, yRange)

  return longestAxis === 0 ? 0 : Math.min(xRange, yRange) / longestAxis
}

export function buildJoystickDiagnosticSample(
  state: HMK_JoystickState,
  config: HMK_JoystickConfig,
): JoystickDiagnosticSample {
  const sample: JoystickDiagnosticSample = {
    raw: normalizeRawPoint({ x: state.rawX, y: state.rawY }, config),
    out: { x: state.outX, y: state.outY },
  }

  if (state.calibratedX !== undefined && state.calibratedY !== undefined) {
    sample.calibrated = { x: state.calibratedX, y: state.calibratedY }
  }

  if (state.correctedX !== undefined && state.correctedY !== undefined) {
    sample.corrected = { x: state.correctedX, y: state.correctedY }
  }

  return sample
}

export function pushBoundedSample<T>(samples: T[], sample: T, limit: number) {
  if (limit <= 0) {
    return []
  }

  if (samples.length < limit) {
    return [...samples, sample]
  }

  return [...samples.slice(samples.length - limit + 1), sample]
}

export function buildCalibrationCandidate(
  centerSamplesX: number[],
  centerSamplesY: number[],
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  sweepSamples: JoystickDiagnosticRawSample[] = [],
): JoystickCalibrationCandidate | null {
  const restAssessment = assessJoystickRestSamples(
    centerSamplesX,
    centerSamplesY,
  )
  if (
    restAssessment.x.sampleCount === 0 ||
    restAssessment.y.sampleCount === 0
  ) {
    return null
  }
  const roundedCenterX = restAssessment.x.center
  const roundedCenterY = restAssessment.y.center

  const calibration = {
    x: {
      min: Math.max(ADC_MIN_FALLBACK, Math.min(minX, roundedCenterX - 100)),
      center: roundedCenterX,
      max: Math.min(ADC_MAX_FALLBACK, Math.max(maxX, roundedCenterX + 100)),
    },
    y: {
      min: Math.max(ADC_MIN_FALLBACK, Math.min(minY, roundedCenterY - 100)),
      center: roundedCenterY,
      max: Math.min(ADC_MAX_FALLBACK, Math.max(maxY, roundedCenterY + 100)),
    },
  }

  return {
    ...calibration,
    radialBoundaries: buildRadialBoundaries(
      sweepSamples.map((sample) => normalizeRawPoint(sample, calibration)),
    ),
  }
}

function scaleAxisCalibrationRange(
  calibration: HMK_JoystickAxisCalibration,
  rangeFactor: number,
): HMK_JoystickAxisCalibration {
  const negativeRange = Math.max(100, calibration.center - calibration.min)
  const positiveRange = Math.max(100, calibration.max - calibration.center)
  const scaledNegativeRange = clamp(Math.round(negativeRange * rangeFactor), [
    100,
    calibration.center - ADC_MIN_FALLBACK,
  ])
  const scaledPositiveRange = clamp(Math.round(positiveRange * rangeFactor), [
    100,
    ADC_MAX_FALLBACK - calibration.center,
  ])

  return {
    min: calibration.center - scaledNegativeRange,
    center: calibration.center,
    max: calibration.center + scaledPositiveRange,
  }
}

function scaleCalibrationCandidateRanges(
  candidate: JoystickCalibrationCandidate,
  xRangeFactor: number,
  yRangeFactor: number,
): JoystickCalibrationCandidate {
  return {
    ...candidate,
    x: scaleAxisCalibrationRange(candidate.x, xRangeFactor),
    y: scaleAxisCalibrationRange(candidate.y, yRangeFactor),
    radialBoundaries: [...candidate.radialBoundaries],
  }
}

function correctedCircularityScore(
  points: JoystickVector[],
  radialBoundaries: number[],
) {
  return computeJoystickCircularity(
    points.map((point) =>
      applyJoystickCircularCorrection(point, radialBoundaries),
    ),
  ).score
}

function interleavedFoldSplit(points: JoystickVector[], foldIndex: number) {
  const training: JoystickVector[] = []
  const holdout: JoystickVector[] = []

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    if (index % RADIAL_BOUNDARY_TUNING_FOLDS === foldIndex) {
      holdout.push(point)
      continue
    }

    training.push(point)
  }

  return { training, holdout }
}

function blockedFoldSplit(points: JoystickVector[], foldIndex: number) {
  if (points.length === 0) {
    return {
      training: [] as JoystickVector[],
      holdout: [] as JoystickVector[],
    }
  }

  const foldSize = Math.ceil(points.length / RADIAL_BOUNDARY_TUNING_FOLDS)
  const startIndex = foldIndex * foldSize
  const endIndex = Math.min(points.length, startIndex + foldSize)

  return {
    training: [...points.slice(0, startIndex), ...points.slice(endIndex)],
    holdout: points.slice(startIndex, endIndex),
  }
}

function averageHoldoutCircularityScore(
  sweepSamples: JoystickDiagnosticRawSample[],
  tunedCandidate: JoystickCalibrationCandidate,
  candidateOptions: RadialBoundaryBuildOptions,
) {
  const splitters = [interleavedFoldSplit, blockedFoldSplit]
  let holdoutScoreSum = 0
  let holdoutScoreCount = 0

  for (const split of splitters) {
    for (
      let foldIndex = 0;
      foldIndex < RADIAL_BOUNDARY_TUNING_FOLDS;
      foldIndex += 1
    ) {
      const { training, holdout } = split(sweepSamples, foldIndex)
      if (training.length === 0 || holdout.length === 0) {
        continue
      }

      const trainingPoints = training.map((sample) =>
        normalizeRawPoint(sample, tunedCandidate),
      )
      const holdoutPoints = holdout.map((sample) =>
        normalizeRawPoint(sample, tunedCandidate),
      )
      const radialBoundaries = buildRadialBoundaries(
        trainingPoints,
        candidateOptions,
      )
      const holdoutScore = correctedCircularityScore(
        holdoutPoints,
        radialBoundaries,
      )

      holdoutScoreSum += holdoutScore
      holdoutScoreCount += 1
    }
  }

  if (holdoutScoreCount === 0) {
    return null
  }

  return holdoutScoreSum / holdoutScoreCount
}

function selectGeneralizedCalibrationOptions(
  candidate: JoystickCalibrationCandidate,
  sweepSamples: JoystickDiagnosticRawSample[],
): CalibrationOptimizationOptions {
  const defaultOptions: CalibrationOptimizationOptions = {
    calibrationPercentile: CALIBRATION_ENVELOPE_PERCENTILE,
    shrinkFactor: 1,
    xRangeFactor: 1,
    yRangeFactor: 1,
  }

  if (sweepSamples.length < RADIAL_BOUNDARY_TUNING_MIN_SAMPLES) {
    return defaultOptions
  }

  let bestOptions = defaultOptions
  let bestScore = Number.NEGATIVE_INFINITY

  for (const calibrationPercentile of RADIAL_BOUNDARY_TUNING_PERCENTILES) {
    for (const shrinkFactor of RADIAL_BOUNDARY_TUNING_SHRINK_FACTORS) {
      for (const xRangeFactor of AXIS_RANGE_TUNING_FACTORS) {
        for (const yRangeFactor of AXIS_RANGE_TUNING_FACTORS) {
          const tunedCandidate = scaleCalibrationCandidateRanges(
            candidate,
            xRangeFactor,
            yRangeFactor,
          )
          const candidateOptions = { calibrationPercentile, shrinkFactor }
          const holdoutScore = averageHoldoutCircularityScore(
            sweepSamples,
            tunedCandidate,
            candidateOptions,
          )
          if (holdoutScore === null) {
            continue
          }

          const normalizedPoints = sweepSamples.map((sample) =>
            normalizeRawPoint(sample, tunedCandidate),
          )
          const fullBoundaries = buildRadialBoundaries(
            normalizedPoints,
            candidateOptions,
          )
          const fullScore = correctedCircularityScore(
            normalizedPoints,
            fullBoundaries,
          )
          const objective =
            holdoutScore * RADIAL_BOUNDARY_TUNING_HOLDOUT_WEIGHT +
            fullScore * RADIAL_BOUNDARY_TUNING_FULL_WEIGHT

          if (objective <= bestScore) {
            continue
          }

          bestScore = objective
          bestOptions = {
            calibrationPercentile,
            shrinkFactor,
            xRangeFactor,
            yRangeFactor,
          }
        }
      }
    }
  }

  return bestOptions
}

export function optimizeCalibrationCandidate(
  candidate: JoystickCalibrationCandidate,
  sweepSamples: JoystickDiagnosticRawSample[],
): JoystickCalibrationCandidate {
  if (sweepSamples.length === 0) {
    return candidate
  }

  const optimizedOptions = selectGeneralizedCalibrationOptions(
    candidate,
    sweepSamples,
  )
  const tunedCandidate = scaleCalibrationCandidateRanges(
    candidate,
    optimizedOptions.xRangeFactor,
    optimizedOptions.yRangeFactor,
  )
  const normalizedPoints = sweepSamples.map((sample) =>
    normalizeRawPoint(sample, tunedCandidate),
  )

  return {
    ...tunedCandidate,
    radialBoundaries: buildRadialBoundaries(normalizedPoints, optimizedOptions),
  }
}

function quadrantCoverage(points: JoystickVector[]) {
  let quadrants = 0

  for (const point of points) {
    if (
      Math.abs(point.x) < QUADRANT_THRESHOLD ||
      Math.abs(point.y) < QUADRANT_THRESHOLD
    ) {
      continue
    }

    if (point.x >= 0 && point.y >= 0) quadrants |= 1 << 0
    if (point.x < 0 && point.y >= 0) quadrants |= 1 << 1
    if (point.x < 0 && point.y < 0) quadrants |= 1 << 2
    if (point.x >= 0 && point.y < 0) quadrants |= 1 << 3
  }

  return quadrants.toString(2).replaceAll("0", "").length
}

function circularityLabel(score: number, sufficient: boolean) {
  if (!sufficient) return "Need More Sweep"
  if (score >= 90) return "Excellent"
  if (score >= 75) return "Good"
  if (score >= 60) return "Fair"
  return "Poor"
}

export function computeJoystickCircularity(
  points: JoystickVector[],
): JoystickCircularityReport {
  if (points.length === 0) {
    return {
      score: 0,
      label: "Need More Sweep",
      sampleCount: 0,
      outerSampleCount: 0,
      quadrantCoverage: 0,
      meanRadius: 0,
      radiusSpread: 0,
      axisRatio: 0,
      sufficient: false,
    }
  }

  const radii = points.map(vectorRadius)
  const maxRadius = Math.max(...radii)
  const outerRadiusThreshold = Math.max(
    MIN_OUTER_RADIUS,
    maxRadius * OUTER_RADIUS_RATIO,
  )
  const outerPoints = points.filter(
    (point) => vectorRadius(point) >= outerRadiusThreshold,
  )

  const sampleCount = points.length
  const outerSampleCount = outerPoints.length
  const quadrants = quadrantCoverage(outerPoints)
  const envelope = collectRadialEnvelope(outerPoints)

  if (outerSampleCount === 0 || envelope.seenCount === 0) {
    return {
      score: 0,
      label: "Need More Sweep",
      sampleCount,
      outerSampleCount,
      quadrantCoverage: quadrants,
      meanRadius: 0,
      radiusSpread: 0,
      axisRatio: 0,
      sufficient: false,
    }
  }

  const envelopeRadii = fillMissingRadialBoundaries(
    envelope.boundaries,
    envelope.seen,
  )
  const meanRadius =
    envelopeRadii.reduce((sum, radius) => sum + radius, 0) /
    envelopeRadii.length
  const minRadius = Math.min(...envelopeRadii)
  const maxOuterRadius = Math.max(...envelopeRadii)
  const radiusSpread =
    meanRadius === 0 ? 0 : (maxOuterRadius - minRadius) / meanRadius

  const axisRatio = envelopeAxisRatio(envelopeRadii)

  const sufficient =
    outerSampleCount >= MIN_OUTER_SAMPLES &&
    quadrants >= 3 &&
    envelope.seenCount >= MIN_ENVELOPE_SECTORS
  const score = clamp(
    100 - radiusSpread * 180 - (1 - axisRatio) * 80 - (4 - quadrants) * 10,
    [0, 100],
  )

  return {
    score,
    label: circularityLabel(score, sufficient),
    sampleCount,
    outerSampleCount,
    quadrantCoverage: quadrants,
    meanRadius,
    radiusSpread,
    axisRatio,
    sufficient,
  }
}
