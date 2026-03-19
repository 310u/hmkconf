import { DataViewReader } from "$lib/data-view-reader"
import { uint8Schema, uint16Schema } from "$lib/integer"
import type { Commander } from "$lib/keyboard/commander"
import z from "zod"
import { HMK_Command } from "."
import { parseCommandOutBuffer } from "../types"

export const joystickAxisCalibrationSchema = z.object({
  min: uint16Schema,
  center: uint16Schema,
  max: uint16Schema,
})
export type HMK_JoystickAxisCalibration = z.infer<
  typeof joystickAxisCalibrationSchema
>

export const joystickConfigSchema = z.object({
  x: joystickAxisCalibrationSchema,
  y: joystickAxisCalibrationSchema,
  deadzone: uint8Schema,
  mode: uint8Schema,
  mouseSpeed: uint8Schema,
  mouseAcceleration: uint8Schema,
  swDebounceMs: uint8Schema,
})
export type HMK_JoystickConfig = z.infer<typeof joystickConfigSchema>

export const joystickStateSchema = z.object({
  rawX: uint16Schema,
  rawY: uint16Schema,
  outX: z.number().int().min(-128).max(127),
  outY: z.number().int().min(-128).max(127),
  sw: z.boolean(),
})
export type HMK_JoystickState = z.infer<typeof joystickStateSchema>

export async function getJoystickState(
  commander: Commander,
): Promise<HMK_JoystickState> {
  const reader = new DataViewReader(
    await commander.sendCommand({
      command: HMK_Command.GET_JOYSTICK_STATE,
      payload: [],
    }),
  )

  parseCommandOutBuffer(reader, HMK_Command.GET_JOYSTICK_STATE)
  reader.uint8()
  const rawX = reader.uint16()
  const rawY = reader.uint16()

  const outX = reader.view.getInt8(reader.offset++)
  const outY = reader.view.getInt8(reader.offset++)

  const sw = reader.uint8() !== 0

  return { rawX, rawY, outX, outY, sw }
}

export type GetJoystickConfigParams = {
  profile: number
}

export async function getJoystickConfig(
  commander: Commander,
  params: GetJoystickConfigParams,
): Promise<HMK_JoystickConfig> {
  const reader = new DataViewReader(
    await commander.sendCommand({
      command: HMK_Command.GET_JOYSTICK_CONFIG,
      payload: [params.profile],
    }),
  )

  parseCommandOutBuffer(reader, HMK_Command.GET_JOYSTICK_CONFIG)

  // Read embedded payload:
  // typedef struct { uint8_t data[20]; } command_out_joystick_config_t;
  // But data is actually joystick_config_t directly.
  const xMin = reader.uint16()
  const xCenter = reader.uint16()
  const xMax = reader.uint16()

  const yMin = reader.uint16()
  const yCenter = reader.uint16()
  const yMax = reader.uint16()

  const deadzone = reader.uint8()
  const mode = reader.uint8()
  const mouseSpeed = reader.uint8()
  const mouseAcceleration = reader.uint8() || 255
  const swDebounceMs = reader.uint8()
  // Skip 3 reserved bytes
  reader.offset += 3

  return {
    x: { min: xMin, center: xCenter, max: xMax },
    y: { min: yMin, center: yCenter, max: yMax },
    deadzone,
    mode,
    mouseSpeed,
    mouseAcceleration,
    swDebounceMs,
  }
}

export type SetJoystickConfigParams = {
  profile: number
  config: HMK_JoystickConfig
}

export async function setJoystickConfig(
  commander: Commander,
  params: SetJoystickConfigParams,
): Promise<void> {
  const payload = new Uint8Array(21) // profile(1) + joystick_config(20)
  const view = new DataView(payload.buffer)

  view.setUint8(0, params.profile)
  view.setUint16(1, params.config.x.min, true)
  view.setUint16(3, params.config.x.center, true)
  view.setUint16(5, params.config.x.max, true)

  view.setUint16(7, params.config.y.min, true)
  view.setUint16(9, params.config.y.center, true)
  view.setUint16(11, params.config.y.max, true)

  view.setUint8(13, params.config.deadzone)
  view.setUint8(14, params.config.mode)
  view.setUint8(15, params.config.mouseSpeed)
  view.setUint8(16, params.config.mouseAcceleration)
  view.setUint8(17, params.config.swDebounceMs)

  // remaining reserved bytes remain 0 by default when using Uint8Array constructor

  await commander.sendCommand({
    command: HMK_Command.SET_JOYSTICK_CONFIG,
    payload: Array.from(payload),
  })
}
