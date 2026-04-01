import type { HMK_JoystickConfig } from "$lib/libhmk/commands/joystick"
import { describe, expect, it } from "vitest"
import {
  buildSelectedMousePresetConfig,
  buildUpdatedActiveMousePresetConfig,
  getJoystickModeLabel,
  joystickConfigsEqual,
} from "./joystick-config"

function makeConfig(): HMK_JoystickConfig {
  return {
    x: { min: 0, center: 2048, max: 4095 },
    y: { min: 0, center: 2048, max: 4095 },
    deadzone: 10,
    mode: 1,
    mouseSpeed: 12,
    mouseAcceleration: 180,
    swDebounceMs: 5,
    scrollProfile: 0,
    activeMousePreset: 1,
    mousePresets: [
      { mouseSpeed: 10, mouseAcceleration: 100 },
      { mouseSpeed: 12, mouseAcceleration: 180 },
      { mouseSpeed: 20, mouseAcceleration: 220 },
      { mouseSpeed: 30, mouseAcceleration: 255 },
    ],
    radialBoundaries: Array.from({ length: 32 }, () => 127),
  }
}

describe("joystick config helpers", () => {
  it("updates only the active mouse preset while keeping config in sync", () => {
    const updated = buildUpdatedActiveMousePresetConfig(
      makeConfig(),
      { mouseAcceleration: 200 },
      true,
    )

    expect(updated.mouseAcceleration).toBe(200)
    expect(updated.mousePresets[1]).toEqual({
      mouseSpeed: 12,
      mouseAcceleration: 200,
    })
    expect(updated.mousePresets[0]).toEqual({
      mouseSpeed: 10,
      mouseAcceleration: 100,
    })
  })

  it("selects a preset and mirrors its values to the top-level config", () => {
    const selected = buildSelectedMousePresetConfig(makeConfig(), 2)

    expect(selected.activeMousePreset).toBe(2)
    expect(selected.mouseSpeed).toBe(20)
    expect(selected.mouseAcceleration).toBe(220)
  })

  it("compares configs including presets when supported", () => {
    const left = makeConfig()
    const right = makeConfig()
    right.mousePresets[1] = { mouseSpeed: 12, mouseAcceleration: 181 }

    expect(
      joystickConfigsEqual(left, right, {
        supportsJoystickMousePresets: true,
      }),
    ).toBe(false)
    expect(
      joystickConfigsEqual(left, left, {
        supportsJoystickMousePresets: true,
      }),
    ).toBe(true)
  })

  it("treats scroll profile changes as a config difference", () => {
    const left = makeConfig()
    const right = makeConfig()
    right.scrollProfile = 1

    expect(
      joystickConfigsEqual(left, right, {
        supportsJoystickMousePresets: true,
      }),
    ).toBe(false)
  })

  it("returns a readable label for joystick modes", () => {
    expect(getJoystickModeLabel(3)).toBe("XInput Right Stick")
    expect(getJoystickModeLabel(99)).toBe("Unknown")
  })
})
