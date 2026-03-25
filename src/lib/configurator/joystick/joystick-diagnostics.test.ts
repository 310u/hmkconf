import { describe, expect, it } from "vitest"
import {
  applyJoystickCircularCorrection,
  buildCalibrationCandidate,
  buildRadialBoundaries,
  computeJoystickCircularity,
  normalizeRawPoint,
} from "./joystick-diagnostics"

describe("joystick diagnostics", () => {
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
})
