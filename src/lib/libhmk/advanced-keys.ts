/*
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later
 * version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { uint8Schema, uint16Schema } from "$lib/integer"
import z from "zod"
import { HMK_MAX_NUM_KEYS, HMK_MAX_NUM_LAYERS } from "."

export const DEFAULT_BOTTOM_OUT_POINT = 230
export const DEFAULT_TAPPING_TERM = 200
export const MIN_TAPPING_TERM = 10
export const MAX_TAPPING_TERM = 1000
export const DEFAULT_TICK_RATE = 30

export enum HMK_AKType {
  NONE = 0,
  NULL_BIND,
  DYNAMIC_KEYSTROKE,
  TAP_HOLD,
  TOGGLE,
  COMBO,
  MACRO,
}

export const hmkAKNoneSchema = z.object({
  type: z.literal(HMK_AKType.NONE),
})

export type HMK_AKNone = z.infer<typeof hmkAKNoneSchema>

export enum HMK_NullBindBehavior {
  LAST = 0,
  PRIMARY,
  SECONDARY,
  NEUTRAL,
  DISTANCE,
}

export const hmkAKNullBindSchema = z.object({
  type: z.literal(HMK_AKType.NULL_BIND),
  secondaryKey: uint8Schema,
  behavior: z.enum(HMK_NullBindBehavior),
  bottomOutPoint: uint8Schema,
})

export type HMK_AKNullBind = z.infer<typeof hmkAKNullBindSchema>

export enum HMK_DKSAction {
  HOLD = 0,
  PRESS,
  RELEASE,
  TAP,
}

export const hmkAKDynamicKeystrokeSchema = z.object({
  type: z.literal(HMK_AKType.DYNAMIC_KEYSTROKE),
  keycodes: z.array(uint8Schema).length(4),
  bitmap: z.array(z.array(z.enum(HMK_DKSAction)).length(4)).length(4),
  bottomOutPoint: uint8Schema,
})

export type HMK_AKDynamicKeystroke = z.infer<typeof hmkAKDynamicKeystrokeSchema>

export enum HMK_TapHoldFlavor {
  HOLD_PREFERRED = 0,
  BALANCED,
  TAP_PREFERRED,
  TAP_UNLESS_INTERRUPTED,
}

export const DEFAULT_QUICK_TAP_MS = 0
export const MAX_QUICK_TAP_MS = 1000
export const DEFAULT_REQUIRE_PRIOR_IDLE_MS = 0
export const MAX_REQUIRE_PRIOR_IDLE_MS = 1000

export const hmkAKTapHoldSchema = z.object({
  type: z.literal(HMK_AKType.TAP_HOLD),
  tapKeycode: uint8Schema,
  holdKeycode: uint8Schema,
  tappingTerm: uint16Schema,
  flavor: z
    .nativeEnum(HMK_TapHoldFlavor)
    .default(HMK_TapHoldFlavor.HOLD_PREFERRED),
  retroTapping: z.boolean().default(false),
  holdWhileUndecided: z.boolean().default(false),
  quickTapMs: uint16Schema.default(0),
  requirePriorIdleMs: uint16Schema.default(0),
  // If set, re-pressing within the double tap window emits this keycode
  // (uses quickTapMs as window if set, otherwise tappingTerm with added latency)
  doubleTapKeycode: uint8Schema.default(0),
})

export type HMK_AKTapHold = z.infer<typeof hmkAKTapHoldSchema>

export const hmkAKToggleSchema = z.object({
  type: z.literal(HMK_AKType.TOGGLE),
  keycode: uint8Schema,
  tappingTerm: uint16Schema,
})

export type HMK_AKToggle = z.infer<typeof hmkAKToggleSchema>

export const hmkAKComboSchema = z.object({
  type: z.literal(HMK_AKType.COMBO),
  keys: z.array(uint8Schema).length(4),
  outputKeycode: uint8Schema,
  term: uint16Schema,
})

export type HMK_AKCombo = z.infer<typeof hmkAKComboSchema>

export enum HMK_MacroAction {
  END = 0,
  TAP,
  PRESS,
  RELEASE,
  DELAY,
}

export const hmkMacroEventSchema = z.object({
  keycode: uint8Schema,
  action: z.nativeEnum(HMK_MacroAction),
}).superRefine((val, ctx) => {
  if (val.action === HMK_MacroAction.DELAY) {
    if (val.keycode < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Delay must be at least 10ms (value 1)",
        path: ["keycode"],
      })
    }
  }
})

export type HMK_MacroEvent = z.infer<typeof hmkMacroEventSchema>

export const MAX_MACRO_EVENTS = 16
export const NUM_MACROS = 16

export const hmkMacroSchema = z.object({
  events: z.array(hmkMacroEventSchema).length(MAX_MACRO_EVENTS),
})

export type HMK_Macro = z.infer<typeof hmkMacroSchema>

export const hmkAKMacroSchema = z.object({
  type: z.literal(HMK_AKType.MACRO),
  macroIndex: uint8Schema,
})

export type HMK_AKMacro = z.infer<typeof hmkAKMacroSchema>

export const hmkAdvancedKeySchema = z.object({
  layer: uint8Schema.max(HMK_MAX_NUM_LAYERS - 1),
  key: uint8Schema.max(HMK_MAX_NUM_KEYS - 1),
  action: z.union([
    hmkAKNoneSchema,
    hmkAKNullBindSchema,
    hmkAKDynamicKeystrokeSchema,
    hmkAKTapHoldSchema,
    hmkAKToggleSchema,
    hmkAKComboSchema,
    hmkAKMacroSchema,
  ]),
})

export type HMK_AdvancedKey = z.infer<typeof hmkAdvancedKeySchema>

export const defaultAdvancedKey: HMK_AdvancedKey = {
  layer: 0,
  key: 0,
  action: { type: HMK_AKType.NONE },
}
