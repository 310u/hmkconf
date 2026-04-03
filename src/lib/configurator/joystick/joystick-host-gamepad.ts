import {
  computeJoystickCircularity,
  type JoystickVector,
} from "./joystick-diagnostics"

export const HOST_GAMEPAD_ACTIVE_THRESHOLD = 8
export const HOST_GAMEPAD_AXIS_SPAN_THRESHOLD = 0.35
export const HOST_GAMEPAD_AXIS_BIPOLAR_THRESHOLD = 0.2
export const HOST_GAMEPAD_AXIS_PAIR_SCORE_THRESHOLD = 0.8

export type HostStickMode = "left" | "right" | null

export type HostGamepadCandidate = {
  index: number
  id: string
  mapping: string
  axes: number
  buttons: number
  sampledStick: HostStickMode
  axisPair: [number, number] | null
  rawAxes: number[]
  vector: JoystickVector | null
  magnitude: number
  active: boolean
  selected: boolean
}

export type HostGamepadState = {
  available: boolean
  connected: boolean
  index: number | null
  id: string | null
  mapping: string | null
  sampledStick: HostStickMode
  axisPair: [number, number] | null
  rawAxes: number[]
  vector: JoystickVector | null
  magnitude: number
  candidates: HostGamepadCandidate[]
}

export function createEmptyHostGamepadState(
  available: boolean,
  sampledStick: HostStickMode = null,
): HostGamepadState {
  return {
    available,
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
}

function clampHostAxis(value: number) {
  return Math.max(-127, Math.min(127, value * 127))
}

export function currentHostStickMode(mode: number | null): HostStickMode {
  if (mode === 2) return "left"
  if (mode === 3) return "right"
  return null
}

function hostGamepadMagnitude(vector: JoystickVector | null) {
  if (!vector) return 0
  return Math.hypot(vector.x, vector.y)
}

function standardHostAxisPair(
  sampledStick: Exclude<HostStickMode, null>,
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

function hostGamepadFallbackMagnitude(rawAxes: number[]) {
  if (rawAxes.length === 0) return 0

  const [largest = 0, secondLargest = 0] = rawAxes
    .map((value) => Math.abs(clampHostAxis(value)))
    .sort((left, right) => right - left)

  return Math.hypot(largest, secondLargest)
}

export function detectHostGamepadAxisPair(
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
      if (leftAxis.index % 2 === 0 && rightAxis.index === leftAxis.index + 1) {
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

export function buildHostGamepadState(
  gamepads: ArrayLike<Gamepad | null>,
  options: {
    sampledStick: HostStickMode
    previousIndex: number | null
    detectedAxisPair: [number, number] | null
  },
): HostGamepadState {
  const { sampledStick, previousIndex, detectedAxisPair } = options
  const connectedGamepads = Array.from(gamepads).filter(
    (gamepad): gamepad is Gamepad => gamepad !== null,
  )

  const candidates = connectedGamepads
    .map((gamepad) => {
      const rawAxes = hostGamepadRawAxes(gamepad)
      const inferredAxisPair =
        sampledStick && gamepad.index === previousIndex
          ? detectedAxisPair
          : null
      const axisPair = sampledStick
        ? gamepad.mapping === "standard"
          ? standardHostAxisPair(sampledStick)
          : inferredAxisPair
        : null
      const vector = axisPair
        ? hostGamepadVectorFromRawAxes(rawAxes, axisPair)
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
    return createEmptyHostGamepadState(true, sampledStick)
  }

  const selectedCandidate = selectHostGamepadCandidate(
    candidates,
    previousIndex,
  )
  const selectedCandidates = candidates.map((candidate) => ({
    ...candidate,
    selected: candidate.index === selectedCandidate?.index,
  }))

  return {
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
