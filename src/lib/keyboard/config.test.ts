import { describe, expect, it } from "vitest"
import { keyboardConfigSchema } from "./config"

describe("keyboardConfigSchema", () => {
  it("should accept macros, rgb, and joystick profile data", () => {
    const parsed = keyboardConfigSchema.parse({
      timestamp: "2026-03-15T00:00:00.000Z",
      metadata: {
        version: 0x0106,
        vendorId: 0x0108,
        productId: 0x0111,
      },
      profile: {
        keymap: [[0]],
        actuationMap: [
          { actuationPoint: 128, rtDown: 0, rtUp: 0, continuous: false },
        ],
        advancedKeys: [],
        gamepadButtons: [0],
        gamepadOptions: {
          analogCurve: [
            { x: 0, y: 0 },
            { x: 85, y: 85 },
            { x: 170, y: 170 },
            { x: 255, y: 255 },
          ],
          keyboardEnabled: true,
          gamepadOverride: false,
          squareJoystick: false,
          snappyJoystick: false,
        },
        tickRate: 30,
        macros: [
          {
            events: Array.from({ length: 16 }, () => ({
              keycode: 0,
              action: 0,
            })),
          },
        ],
        rgbConfig: {
          enabled: 1,
          globalBrightness: 51,
          currentEffect: 1,
          solidColor: { r: 255, g: 0, b: 0 },
          secondaryColor: { r: 255, g: 255, b: 255 },
          effectSpeed: 128,
          sleepTimeout: 0,
          layerIndicatorMode: 0,
          layerIndicatorKey: 0,
          layerColors: [],
          perKeyColors: [],
        },
        joystickConfig: {
          x: { min: 0, center: 2048, max: 4095 },
          y: { min: 0, center: 2048, max: 4095 },
          deadzone: 150,
          mode: 1,
          mouseSpeed: 10,
          mouseAcceleration: 255,
          swDebounceMs: 5,
        },
      },
    })

    expect(parsed.profile.macros).toHaveLength(1)
    expect(parsed.profile.rgbConfig?.enabled).toBe(1)
    expect(parsed.profile.joystickConfig?.mode).toBe(1)
    expect(parsed.profile.joystickConfig?.activeMousePreset).toBe(0)
    expect(parsed.profile.joystickConfig?.mousePresets).toHaveLength(4)
    expect(parsed.profile.joystickConfig?.mousePresets[0]).toEqual({
      mouseSpeed: 10,
      mouseAcceleration: 255,
    })
    expect(parsed.profile.joystickConfig?.radialBoundaries).toHaveLength(32)
  })
})
