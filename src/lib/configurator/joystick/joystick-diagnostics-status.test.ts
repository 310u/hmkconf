import { describe, expect, it } from "vitest"
import {
  circularityTone,
  detectLinuxHost,
  getCurrentGamepadTransport,
  getFreshCaptureStatus,
  getGamepadHostValidationMode,
  getHostCircularitySubtitle,
  getHostGamepadBackend,
  getHostGamepadStatus,
  getTransportValidationAdvice,
  supportsHostTransportComparison,
} from "./joystick-diagnostics-status"
import { createEmptyHostGamepadState } from "./joystick-host-gamepad"

describe("joystick diagnostic status helpers", () => {
  it("reports the host backend from environment hints", () => {
    expect(getHostGamepadBackend(false, false)).toBe("Gamepad API unavailable")
    expect(getHostGamepadBackend(true, true)).toBe(
      "Chromium Gamepad API via Linux joydev",
    )
    expect(getHostGamepadBackend(true, false)).toBe("Browser Gamepad API")
  })

  it("builds host gamepad status messages from state", () => {
    const unavailable = createEmptyHostGamepadState(false)
    expect(getHostGamepadStatus(unavailable)).toBe(
      "Gamepad API is not available in this environment.",
    )

    const inferred = {
      ...createEmptyHostGamepadState(true, "left"),
      candidates: [
        {
          index: 0,
          id: "Pad",
          mapping: "standard",
          axes: 4,
          buttons: 12,
          sampledStick: "left" as const,
          axisPair: null,
          rawAxes: [0, 0, 0, 0],
          vector: null,
          magnitude: 0,
          active: false,
          selected: true,
        },
      ],
      connected: true,
      index: 0,
      id: "Pad",
      mapping: "standard",
      magnitude: 4,
    }
    expect(getHostGamepadStatus(inferred)).toContain(
      "stick axis pair is still being inferred",
    )
  })

  it("describes validation mode and transport advice", () => {
    expect(getGamepadHostValidationMode(1, true)).toContain(
      "Switch the joystick mode",
    )
    expect(getGamepadHostValidationMode(2, false)).toContain(
      "browser host checks read the Gamepad API through joydev",
    )
    expect(getTransportValidationAdvice(false)).toContain(
      "Chromium/Electron reads Gamepad API axes through joydev",
    )
    expect(getHostCircularitySubtitle(true)).toBe(
      "Confirms whether HID and XInput look different on the host.",
    )
  })

  it("formats fresh capture state and simple environment helpers", () => {
    expect(getFreshCaptureStatus("capturing", 42)).toBe(
      "Capturing a fresh sweep: 42 samples recorded.",
    )
    expect(circularityTone(92, true)).toBe("bg-emerald-500/15 text-emerald-700")
    expect(detectLinuxHost("Mozilla/5.0 X11; Linux x86_64")).toBe(true)
    expect(supportsHostTransportComparison(true, true)).toBe(false)
    expect(getCurrentGamepadTransport(null)).toBe("Unknown")
  })
})
