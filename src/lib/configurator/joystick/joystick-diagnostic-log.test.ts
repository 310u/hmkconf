import { describe, expect, it } from "vitest"
import {
  circularityScoreDelta,
  describeLinuxHostPrediction,
  roundValue,
} from "./joystick-diagnostic-log"

const report = (score: number, sufficient = true, sampleCount = 64) => ({
  score,
  label: "Test",
  sampleCount,
  outerSampleCount: sampleCount,
  quadrantCoverage: 4,
  meanRadius: 127,
  radiusSpread: 0.05,
  axisRatio: 1,
  sufficient,
})

describe("joystick diagnostic log helpers", () => {
  it("rounds deltas consistently", () => {
    expect(circularityScoreDelta(report(92.125), report(89.004))).toBe(3.12)
    expect(roundValue(1.23456, 3)).toBe(1.235)
  })

  it("explains when measured Linux host data is unavailable", () => {
    const message = describeLinuxHostPrediction(
      report(0, false, 0),
      report(94),
      report(82),
    )

    expect(message).toContain("not available yet")
    expect(message).toContain("default joydev baseline")
  })

  it("distinguishes between firmware-like and joydev-like Linux results", () => {
    const firmwareLike = describeLinuxHostPrediction(
      report(93),
      report(94),
      report(84),
    )
    const joydevLike = describeLinuxHostPrediction(
      report(84),
      report(94),
      report(83),
    )

    expect(firmwareLike).toContain("matches firmware OUT")
    expect(joydevLike).toContain("matches the default joydev baseline")
  })
})
