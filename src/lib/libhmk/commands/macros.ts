import { DataViewReader } from "$lib/data-view-reader"
import { uint8Schema } from "$lib/integer"
import type { Commander } from "$lib/keyboard/commander"
import {
  HMK_MacroAction,
  hmkMacroSchema,
  MAX_MACRO_EVENTS,
  NUM_MACROS,
  type HMK_Macro,
} from "$lib/libhmk/advanced-keys"
import { HMK_Command } from "$lib/libhmk/commands"
import z from "zod"

export const rawMacroSchema = hmkMacroSchema.extend({
  events: z.array(
    z.object({
      keycode: uint8Schema,
      action: z.nativeEnum(HMK_MacroAction),
    }),
  ),
})

export type RawMacro = z.infer<typeof rawMacroSchema>

export const getMacros = async (
  commander: Commander,
  profile: number,
): Promise<HMK_Macro[]> => {
  const result: HMK_Macro[] = []

  // Fetch macros in chunks to avoid buffer overflow, but since each macro is small (32 bytes),
  // we can fetch one by one or in small batches. Let's fetch one by one for simplicity
  // and reliability given RAW_HID_EP_SIZE constraint (64 bytes).
  // Request: profile(1) + offset(1) + len(1) + padding...
  // Response: command_id(1) + macros(32) + padding...
  // So we can fetch 1 macro per request comfortably.

  for (let i = 0; i < NUM_MACROS; i++) {
    const payload = [
      profile,
      i, // offset
      1, // len
    ]

    const response = await commander.sendCommand({
      command: HMK_Command.GET_MACROS,
      payload,
    })

    // Parse response
    // Response format: command_id(1) + macros[1]...
    // macro_t is 32 bytes: events[16] * 2 bytes (keycode, action)

    const macro: HMK_Macro = { events: [] }
    const reader = new DataViewReader(response)

    for (let e = 0; e < MAX_MACRO_EVENTS; e++) {
      const keycode = reader.uint8()
      const action = reader.uint8() as HMK_MacroAction
      macro.events.push({ keycode, action })
    }

    result.push(macro)
  }

  return result
}

export const setMacros = async (
  commander: Commander,
  profile: number,
  macros: HMK_Macro[],
  offset = 0,
) => {
  // Set macros one by one
  for (let i = 0; i < macros.length; i++) {
    const macroIndex = offset + i
    if (macroIndex >= NUM_MACROS) break

    const macro = macros[i]
    if (!macro) continue

    const buffer: number[] = []

    // Serialize events
    for (let e = 0; e < MAX_MACRO_EVENTS; e++) {
      const event = macro.events[e] || {
        keycode: 0,
        action: HMK_MacroAction.END,
      }
      buffer.push(event.keycode, event.action)
    }

    const payload = [
      profile,
      macroIndex, // offset
      1, // len
      ...buffer,
    ]

    await commander.sendCommand({
      command: HMK_Command.SET_MACROS,
      payload,
    })
  }
}
