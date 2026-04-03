import { describe, expect, it } from "vitest"
import {
  buildHostGamepadState,
  currentHostStickMode,
  detectHostGamepadAxisPair,
} from "./joystick-host-gamepad"

function makeGamepad(params: {
  index: number
  id?: string
  mapping?: string
  axes: number[]
  buttons?: number
}) {
  return {
    index: params.index,
    id: params.id ?? `pad-${params.index}`,
    mapping: params.mapping ?? "",
    axes: params.axes,
    buttons: Array.from({ length: params.buttons ?? 0 }, () => ({})),
  } as unknown as Gamepad
}

describe("joystick host gamepad helpers", () => {
  it("detects the active axis pair from accumulated history", () => {
    const axesHistory = Array.from({ length: 12 }, (_, index) => {
      const phase = (Math.PI * 2 * index) / 12
      return [Math.cos(phase) * 0.9, Math.sin(phase) * 0.85, 0.02, -0.03]
    })

    expect(detectHostGamepadAxisPair(axesHistory)).toEqual([0, 1])
  })

  it("prefers the active standard-mapped candidate for the current stick", () => {
    const state = buildHostGamepadState(
      [
        makeGamepad({
          index: 1,
          mapping: "standard",
          axes: [0.8, -0.5, 0, 0],
          buttons: 12,
        }),
        makeGamepad({
          index: 2,
          mapping: "",
          axes: [0.1, 0.05, 0, 0],
          buttons: 10,
        }),
      ],
      {
        sampledStick: currentHostStickMode(2),
        previousIndex: null,
        detectedAxisPair: null,
      },
    )

    expect(state.connected).toBe(true)
    expect(state.index).toBe(1)
    expect(state.axisPair).toEqual([0, 1])
    expect(state.vector).toEqual({ x: 101.6, y: 63.5 })
    expect(state.candidates[0]?.selected).toBe(true)
  })
})
