import { describe, expect, it } from "vitest"
import { HMK_MacroAction, hmkMacroEventSchema } from "./advanced-keys"

describe("hmkMacroEventSchema", () => {
  it("should accept valid TAP actions", () => {
    const result = hmkMacroEventSchema.safeParse({
      keycode: 4, // KC_A
      action: HMK_MacroAction.TAP,
    })
    expect(result.success).toBe(true)
  })

  it("should accept valid DELAY actions within bounds", () => {
    // 1 unit = 10ms
    const result1 = hmkMacroEventSchema.safeParse({
      keycode: 1, // 10ms
      action: HMK_MacroAction.DELAY,
    })
    expect(result1.success).toBe(true)

    const result2 = hmkMacroEventSchema.safeParse({
      keycode: 255, // 2550ms
      action: HMK_MacroAction.DELAY,
    })
    expect(result2.success).toBe(true)
  })

  it("should reject DELAY actions with 0 units", () => {
    const result = hmkMacroEventSchema.safeParse({
      keycode: 0, // 0ms is invalid
      action: HMK_MacroAction.DELAY,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "Delay must be at least 10ms",
      )
    }
  })

  it("should reject DELAY actions with negative units", () => {
    const result = hmkMacroEventSchema.safeParse({
      keycode: -1, // Schema also catches uint8 violations
      action: HMK_MacroAction.DELAY,
    })
    expect(result.success).toBe(false)
  })
})
