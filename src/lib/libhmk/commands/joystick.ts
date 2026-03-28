import { DataViewReader } from "$lib/data-view-reader"
import { uint8Schema, uint16Schema } from "$lib/integer"
import type { Commander } from "$lib/keyboard/commander"
import z from "zod"
import { HMK_Command } from "."
import { parseCommandOutBuffer } from "../types"

export const HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS = 32
export const HMK_JOYSTICK_RADIAL_BOUNDARY_DEFAULT = 127
export const HMK_JOYSTICK_RADIAL_BOUNDARY_FIRMWARE_VERSION = 0x0109
export const HMK_JOYSTICK_MOUSE_PRESET_COUNT = 4
export const HMK_JOYSTICK_MOUSE_PRESET_FIRMWARE_VERSION = 0x010a
export const HMK_JOYSTICK_STATE_STAGE_FIRMWARE_VERSION = 0x010b

export function makeDefaultJoystickRadialBoundaries() {
  return Array.from(
    { length: HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS },
    () => HMK_JOYSTICK_RADIAL_BOUNDARY_DEFAULT,
  )
}

export const joystickMousePresetSchema = z.object({
  mouseSpeed: uint8Schema,
  mouseAcceleration: uint8Schema,
})
export type HMK_JoystickMousePreset = z.infer<typeof joystickMousePresetSchema>

export function makeDefaultJoystickMousePresets(
  mouseSpeed = 10,
  mouseAcceleration = 255,
): HMK_JoystickMousePreset[] {
  return Array.from({ length: HMK_JOYSTICK_MOUSE_PRESET_COUNT }, () => ({
    mouseSpeed,
    mouseAcceleration,
  }))
}

export const joystickAxisCalibrationSchema = z.object({
  min: uint16Schema,
  center: uint16Schema,
  max: uint16Schema,
})
export type HMK_JoystickAxisCalibration = z.infer<
  typeof joystickAxisCalibrationSchema
>

const joystickConfigBaseSchema = z.object({
  x: joystickAxisCalibrationSchema,
  y: joystickAxisCalibrationSchema,
  deadzone: uint8Schema,
  mode: uint8Schema,
  mouseSpeed: uint8Schema,
  mouseAcceleration: uint8Schema,
  swDebounceMs: uint8Schema,
  activeMousePreset: uint8Schema.optional(),
  mousePresets: z
    .array(joystickMousePresetSchema)
    .max(HMK_JOYSTICK_MOUSE_PRESET_COUNT)
    .optional(),
  radialBoundaries: z
    .array(uint8Schema)
    .length(HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS)
    .default(makeDefaultJoystickRadialBoundaries),
})

export function normalizeJoystickConfigPresets(
  config: z.input<typeof joystickConfigBaseSchema>,
) {
  const fallback = {
    mouseSpeed: config.mouseSpeed || 10,
    mouseAcceleration: config.mouseAcceleration || 255,
  }
  const activeMousePreset =
    config.activeMousePreset !== undefined &&
    config.activeMousePreset < HMK_JOYSTICK_MOUSE_PRESET_COUNT
      ? config.activeMousePreset
      : 0
  const mousePresets = Array.from(
    { length: HMK_JOYSTICK_MOUSE_PRESET_COUNT },
    (_, index) => ({
      mouseSpeed:
        config.mousePresets?.[index]?.mouseSpeed || fallback.mouseSpeed,
      mouseAcceleration:
        config.mousePresets?.[index]?.mouseAcceleration ||
        fallback.mouseAcceleration,
    }),
  )
  const activePreset = mousePresets[activeMousePreset]

  return {
    ...config,
    mouseSpeed: activePreset.mouseSpeed,
    mouseAcceleration: activePreset.mouseAcceleration,
    activeMousePreset,
    mousePresets,
    radialBoundaries:
      config.radialBoundaries ?? makeDefaultJoystickRadialBoundaries(),
  }
}

export const joystickConfigSchema = joystickConfigBaseSchema.transform((config) =>
  normalizeJoystickConfigPresets(config),
)
export type HMK_JoystickConfig = z.output<typeof joystickConfigSchema>

export const joystickStateSchema = z.object({
  profile: uint8Schema,
  rawX: uint16Schema,
  rawY: uint16Schema,
  outX: z.number().int().min(-128).max(127),
  outY: z.number().int().min(-128).max(127),
  sw: z.boolean(),
  calibratedX: z.number().int().min(-128).max(127).optional(),
  calibratedY: z.number().int().min(-128).max(127).optional(),
  correctedX: z.number().int().min(-128).max(127).optional(),
  correctedY: z.number().int().min(-128).max(127).optional(),
})
export type HMK_JoystickState = z.infer<typeof joystickStateSchema>

export async function getJoystickState(
  commander: Commander,
  firmwareVersion = HMK_JOYSTICK_MOUSE_PRESET_FIRMWARE_VERSION,
): Promise<HMK_JoystickState> {
  const reader = new DataViewReader(
    await commander.sendCommand({
      command: HMK_Command.GET_JOYSTICK_STATE,
      payload: [],
    }),
  )

  parseCommandOutBuffer(reader, HMK_Command.GET_JOYSTICK_STATE)
  const profile = reader.uint8()
  const rawX = reader.uint16()
  const rawY = reader.uint16()

  const outX = reader.view.getInt8(reader.offset++)
  const outY = reader.view.getInt8(reader.offset++)

  const sw = reader.uint8() !== 0
  const calibratedX =
    firmwareVersion >= HMK_JOYSTICK_STATE_STAGE_FIRMWARE_VERSION
      ? reader.view.getInt8(reader.offset++)
      : undefined
  const calibratedY =
    firmwareVersion >= HMK_JOYSTICK_STATE_STAGE_FIRMWARE_VERSION
      ? reader.view.getInt8(reader.offset++)
      : undefined
  const correctedX =
    firmwareVersion >= HMK_JOYSTICK_STATE_STAGE_FIRMWARE_VERSION
      ? reader.view.getInt8(reader.offset++)
      : undefined
  const correctedY =
    firmwareVersion >= HMK_JOYSTICK_STATE_STAGE_FIRMWARE_VERSION
      ? reader.view.getInt8(reader.offset++)
      : undefined

  return {
    profile,
    rawX,
    rawY,
    outX,
    outY,
    sw,
    calibratedX,
    calibratedY,
    correctedX,
    correctedY,
  }
}

export type GetJoystickConfigParams = {
  profile: number
}

export async function getJoystickConfig(
  commander: Commander,
  params: GetJoystickConfigParams,
  firmwareVersion = HMK_JOYSTICK_RADIAL_BOUNDARY_FIRMWARE_VERSION,
): Promise<HMK_JoystickConfig> {
  const reader = new DataViewReader(
    await commander.sendCommand({
      command: HMK_Command.GET_JOYSTICK_CONFIG,
      payload: [params.profile],
    }),
  )

  parseCommandOutBuffer(reader, HMK_Command.GET_JOYSTICK_CONFIG)

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
  // Skip legacy reserved bytes.
  reader.offset += 3
  const radialBoundaries =
    firmwareVersion >= HMK_JOYSTICK_RADIAL_BOUNDARY_FIRMWARE_VERSION
      ? Array.from({ length: HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS }, () =>
          reader.uint8(),
        )
      : makeDefaultJoystickRadialBoundaries()
  const activeMousePreset =
    firmwareVersion >= HMK_JOYSTICK_MOUSE_PRESET_FIRMWARE_VERSION
      ? reader.uint8()
      : 0
  const mousePresets =
    firmwareVersion >= HMK_JOYSTICK_MOUSE_PRESET_FIRMWARE_VERSION
      ? Array.from({ length: HMK_JOYSTICK_MOUSE_PRESET_COUNT }, () => ({
          mouseSpeed: reader.uint8(),
          mouseAcceleration: reader.uint8(),
        }))
      : makeDefaultJoystickMousePresets(mouseSpeed, mouseAcceleration)

  return normalizeJoystickConfigPresets({
    x: { min: xMin, center: xCenter, max: xMax },
    y: { min: yMin, center: yCenter, max: yMax },
    deadzone,
    mode,
    mouseSpeed,
    mouseAcceleration,
    swDebounceMs,
    activeMousePreset,
    mousePresets,
    radialBoundaries,
  })
}

export type SetJoystickConfigParams = {
  profile: number
  config: HMK_JoystickConfig
}

export async function setJoystickConfig(
  commander: Commander,
  params: SetJoystickConfigParams,
): Promise<void> {
  const payload = new Uint8Array(
    21 +
      HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS +
      1 +
      HMK_JOYSTICK_MOUSE_PRESET_COUNT * 2,
  )
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
  for (let i = 0; i < HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS; i++) {
    view.setUint8(21 + i, params.config.radialBoundaries[i] ?? 127)
  }
  view.setUint8(21 + HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS, params.config.activeMousePreset)
  for (let i = 0; i < HMK_JOYSTICK_MOUSE_PRESET_COUNT; i++) {
    const preset = params.config.mousePresets[i] ?? {
      mouseSpeed: params.config.mouseSpeed,
      mouseAcceleration: params.config.mouseAcceleration,
    }
    const offset =
      22 + HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS + i * 2
    view.setUint8(offset, preset.mouseSpeed)
    view.setUint8(offset + 1, preset.mouseAcceleration)
  }

  await commander.sendCommand({
    command: HMK_Command.SET_JOYSTICK_CONFIG,
    payload: Array.from(payload),
  })
}
