import { describe, expect, it } from "vitest"
import {
  applyJoystickCircularCorrection,
  buildCalibrationCandidate,
  buildRadialBoundaries,
  computeJoystickCircularity,
  normalizeRawPoint,
  optimizeCalibrationCandidate,
  predictLinuxJoydevGamepadPoint,
} from "./joystick-diagnostics"

describe("joystick diagnostics", () => {
  function denormalizeAxis(
    value: number,
    center: number,
    negativeRange: number,
    positiveRange: number,
  ) {
    if (value >= 0) {
      return Math.round(center + (value * positiveRange) / 127)
    }

    return Math.round(center + (value * negativeRange) / 128)
  }

  function makeSweepSamples(
    count: number,
    angleOffset = 0,
    radialScale: (angle: number) => number = () => 1,
  ) {
    const centerX = 2048
    const centerY = 2048
    const trueXNegativeRange = 1150
    const trueXPositiveRange = 1150
    const trueYNegativeRange = 1275
    const trueYPositiveRange = 1275

    return Array.from({ length: count }, (_, index) => {
      const angle = angleOffset + (Math.PI * 2 * index) / count
      const radius = 127 * radialScale(angle)
      const normalizedX = Math.cos(angle) * radius
      const normalizedY = Math.sin(angle) * radius

      return {
        x: denormalizeAxis(
          normalizedX,
          centerX,
          trueXNegativeRange,
          trueXPositiveRange,
        ),
        y: denormalizeAxis(
          normalizedY,
          centerY,
          trueYNegativeRange,
          trueYPositiveRange,
        ),
      }
    })
  }

  it("normalizes raw joystick samples using the same signed ranges as firmware", () => {
    const point = normalizeRawPoint(
      { x: 3072, y: 1024 },
      {
        x: { min: 0, center: 2048, max: 4095 },
        y: { min: 0, center: 2048, max: 4095 },
      },
    )

    expect(point.x).toBeCloseTo(63.5, 1)
    expect(point.y).toBeCloseTo(-64, 1)
  })

  it("builds a safe calibration candidate including radial boundaries", () => {
    const candidate = buildCalibrationCandidate(
      [2000, 2048, 2096],
      [2010, 2048, 2086],
      1100,
      3200,
      1200,
      3150,
      [
        { x: 3200, y: 2048 },
        { x: 2048, y: 3150 },
        { x: 1100, y: 2048 },
        { x: 2048, y: 1200 },
      ],
    )

    expect(candidate).toEqual({
      x: { min: 1100, center: 2048, max: 3200 },
      y: { min: 1200, center: 2048, max: 3150 },
      radialBoundaries: expect.arrayContaining([127]),
    })
    expect(candidate?.radialBoundaries).toHaveLength(32)
  })

  it("builds a boundary table that reflects diagonal stretch", () => {
    const points = Array.from({ length: 32 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 32
      const isDiagonalSector = index % 8 === 4
      const radius = isDiagonalSector ? 175 : 127
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      }
    })

    const boundaries = buildRadialBoundaries(points)

    expect(boundaries[0]).toBe(127)
    expect(boundaries[4]).toBeGreaterThan(boundaries[0])
  })

  it("scores circular sweeps higher after boundary correction", () => {
    const boundaries = Array.from({ length: 32 }, () => 127)
    boundaries[4] = 175
    boundaries[12] = 175
    boundaries[20] = 175
    boundaries[28] = 175
    const stretched = Array.from({ length: 32 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 32
      const isDiagonalSector = index % 8 === 4
      return {
        x: Math.cos(angle) * (isDiagonalSector ? 175 : 127),
        y: Math.sin(angle) * (isDiagonalSector ? 175 : 127),
      }
    })

    const corrected = stretched.map((point) =>
      applyJoystickCircularCorrection(point, boundaries),
    )

    const stretchedReport = computeJoystickCircularity(stretched)
    const correctedReport = computeJoystickCircularity(corrected)

    expect(correctedReport.score).toBeGreaterThan(stretchedReport.score)
    expect(correctedReport.score).toBeGreaterThan(95)
  })

  it("uses monotone cubic interpolation between neighboring sector boundaries", () => {
    const boundaries = Array.from({ length: 32 }, () => 127)
    boundaries[2] = 145
    boundaries[3] = 181
    boundaries[4] = 145
    boundaries[5] = 127

    const angle = ((3.5 * Math.PI) / 16)
    const point = {
      x: Math.cos(angle) * 164,
      y: Math.sin(angle) * 164,
    }
    const corrected = applyJoystickCircularCorrection(point, boundaries)

    expect(corrected).toEqual({ x: 97, y: 80 })
    expect(Math.hypot(corrected.x, corrected.y)).toBeLessThan(127)
  })

  it("iteratively refines boundaries for smooth angular distortion", () => {
    const distorted = Array.from({ length: 256 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 256
      const radius = 127 + Math.sin(angle * 4) * 18 + Math.cos(angle * 2) * 9
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      }
    })

    const boundaries = buildRadialBoundaries(distorted)
    const corrected = distorted.map((point) =>
      applyJoystickCircularCorrection(point, boundaries),
    )
    const correctedReport = computeJoystickCircularity(corrected)

    expect(correctedReport.score).toBeGreaterThan(97)
  })

  it("scores the outer envelope instead of penalizing interior sweep points", () => {
    const outerRing = Array.from({ length: 64 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 64
      return {
        x: Math.cos(angle) * 127,
        y: Math.sin(angle) * 127,
      }
    })
    const interiorSweep = Array.from({ length: 64 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 64
      return {
        x: Math.cos(angle) * 100,
        y: Math.sin(angle) * 100,
      }
    })

    const report = computeJoystickCircularity([...outerRing, ...interiorSweep])

    expect(report.score).toBeGreaterThan(90)
    expect(report.label).toBe("Excellent")
  })

  it("optimizes axis ranges alongside radial boundaries for noisy sweeps", () => {
    const sweepSamples = makeSweepSamples(
      256,
      0,
      (angle) => 1 + Math.sin(angle * 3) * 0.06 + Math.cos(angle * 2) * 0.03,
    )
    const holdoutSamples = makeSweepSamples(
      160,
      Math.PI / 160,
      (angle) => 1 + Math.sin(angle * 3) * 0.06 + Math.cos(angle * 2) * 0.03,
    )
    const candidate = buildCalibrationCandidate(
      [2047, 2048, 2049, 2048],
      [2047, 2048, 2048, 2049],
      2048 - 1224,
      2048 + 1224,
      2048 - 1224,
      2048 + 1224,
      sweepSamples,
    )

    expect(candidate).not.toBeNull()

    const optimized = optimizeCalibrationCandidate(candidate!, sweepSamples)
    const baselineReport = computeJoystickCircularity(
      holdoutSamples.map((sample) =>
        applyJoystickCircularCorrection(
          normalizeRawPoint(sample, candidate!),
          candidate!.radialBoundaries,
        ),
      ),
    )
    const optimizedReport = computeJoystickCircularity(
      holdoutSamples.map((sample) =>
        applyJoystickCircularCorrection(
          normalizeRawPoint(sample, optimized),
          optimized.radialBoundaries,
        ),
      ),
    )

    expect(optimizedReport.score).toBeGreaterThan(baselineReport.score)
    expect(optimizedReport.score).toBeGreaterThan(95)
  })

  it("models Linux joydev deadzone compression from int8 HID axes", () => {
    expect(predictLinuxJoydevGamepadPoint({ x: 0, y: 0 })).toEqual({
      x: 0,
      y: 0,
    })
    expect(predictLinuxJoydevGamepadPoint({ x: 15, y: -15 })).toEqual({
      x: 0,
      y: 0,
    })

    const corrected = predictLinuxJoydevGamepadPoint({ x: 127, y: -127 })
    expect(corrected.x).toBeCloseTo(127, 5)
    expect(corrected.y).toBeCloseTo(-127, 5)
  })

  it("predicts lower circularity for Linux joydev host capture than firmware out", () => {
    const circle = Array.from({ length: 256 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 256
      return {
        x: Math.cos(angle) * 127,
        y: Math.sin(angle) * 127,
      }
    })

    const firmwareReport = computeJoystickCircularity(circle)
    const linuxJoydevReport = computeJoystickCircularity(
      circle.map((point) => predictLinuxJoydevGamepadPoint(point)),
    )

    expect(firmwareReport.score).toBeGreaterThan(95)
    expect(linuxJoydevReport.score).toBeLessThan(firmwareReport.score)
    expect(linuxJoydevReport.score).toBeLessThan(90)
  })
})
