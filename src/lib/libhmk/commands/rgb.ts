import { DataViewReader } from "$lib/data-view-reader"
import { uint8Schema } from "$lib/integer"
import type { Commander } from "$lib/keyboard/commander"
import z from "zod"
import { HMK_Command } from "."
import { parseCommandOutBuffer } from "../types"

export const rgbColorSchema = z.object({
  r: uint8Schema,
  g: uint8Schema,
  b: uint8Schema,
})

export type HMK_RgbColor = z.infer<typeof rgbColorSchema>

export const HMK_RGB_BACKGROUND_COLOR_FIRMWARE_VERSION = 0x010d
const RGB_CONFIG_BASE_HEADER_SIZE_LEGACY = 13
const RGB_CONFIG_BASE_HEADER_SIZE_WITH_BACKGROUND = 16

// The firmware structure layout (matches rgb_config_t in rgb.h)
// uint8_t enabled;                        (1 byte)
// uint8_t global_brightness;              (1 byte)
// uint8_t current_effect;                 (1 byte)
// rgb_color_t solid_color;                (3 bytes)
// rgb_color_t secondary_color;            (3 bytes)
// rgb_color_t background_color;           (3 bytes)
// uint8_t effect_speed;                   (1 byte)
// uint8_t sleep_timeout;                  (1 byte)
// uint8_t layer_indicator_mode;           (1 byte)
// uint8_t layer_indicator_key;            (1 byte)
// rgb_color_t layer_colors[NUM_LAYERS];   (NUM_LAYERS * 3 bytes)
// rgb_color_t per_key_colors[NUM_KEYS];   (NUM_KEYS * 3 bytes)
// rgb_color_t trigger_state_colors[4];    (12 bytes)
//
// Header size: 16 bytes (before layer_colors)

const rgbConfigBaseSchema = z.object({
  enabled: z.number(),
  globalBrightness: z.number(),
  currentEffect: z.number(),
  solidColor: rgbColorSchema,
  secondaryColor: rgbColorSchema,
  backgroundColor: rgbColorSchema.optional(),
  effectSpeed: z.number(),
  sleepTimeout: z.number(),
  layerIndicatorMode: z.number(),
  layerIndicatorKey: z.number(),
  layerColors: z.array(rgbColorSchema),
  perKeyColors: z.array(rgbColorSchema),
  triggerStateColors: z.array(rgbColorSchema).length(4),
})

export const rgbConfigSchema = rgbConfigBaseSchema.transform((config) => ({
  ...config,
  backgroundColor: config.backgroundColor ?? config.secondaryColor,
}))

export type HMK_RgbConfig = z.infer<typeof rgbConfigSchema>

export const GET_SET_RGB_CONFIG_MAX_ENTRIES = 59
const RGB_TRIGGER_STATE_COLOR_COUNT = 4

function supportsBackgroundColor(firmwareVersion?: number) {
  return (
    (firmwareVersion ?? HMK_RGB_BACKGROUND_COLOR_FIRMWARE_VERSION) >=
    HMK_RGB_BACKGROUND_COLOR_FIRMWARE_VERSION
  )
}

function rgbConfigHeaderSize(firmwareVersion?: number) {
  return supportsBackgroundColor(firmwareVersion)
    ? RGB_CONFIG_BASE_HEADER_SIZE_WITH_BACKGROUND
    : RGB_CONFIG_BASE_HEADER_SIZE_LEGACY
}

function rgbConfigSize(
  numKeys: number,
  numLayers: number,
  firmwareVersion?: number,
) {
  return (
    rgbConfigHeaderSize(firmwareVersion) +
    numLayers * 3 +
    numKeys * 3 +
    RGB_TRIGGER_STATE_COLOR_COUNT * 3
  )
}

export type GetRgbConfigParams = {
  profile: number
  numKeys: number
  numLayers: number
  firmwareVersion?: number
}

export async function getRgbConfig(
  commander: Commander,
  params: GetRgbConfigParams,
): Promise<HMK_RgbConfig> {
  const hasBackgroundColor = supportsBackgroundColor(params.firmwareVersion)
  const configSize = rgbConfigSize(
    params.numKeys,
    params.numLayers,
    params.firmwareVersion,
  )
  const data: number[] = []

  while (data.length < configSize) {
    const reader = new DataViewReader(
      await commander.sendCommand({
        command: HMK_Command.GET_RGB_CONFIG,
        payload: [params.profile, data.length, 0], // Offset in byte 2
      }),
    )

    const response = parseCommandOutBuffer(reader, HMK_Command.GET_RGB_CONFIG)

    if (
      response.commandId !== HMK_Command.GET_RGB_CONFIG ||
      !response.rgbConfigData
    ) {
      throw new Error(`Failed to get RGB config for profile ${params.profile}`)
    }

    const chunkLen = Math.min(
      GET_SET_RGB_CONFIG_MAX_ENTRIES,
      configSize - data.length,
    )
    data.push(...response.rgbConfigData.slice(0, chunkLen))
  }

  // Parse the raw bytes back into the object
  let ptr = 0
  const enabled = data[ptr++]
  const globalBrightness = data[ptr++]
  const currentEffect = data[ptr++]
  const solidColor = { r: data[ptr++], g: data[ptr++], b: data[ptr++] }
  const secondaryColor = { r: data[ptr++], g: data[ptr++], b: data[ptr++] }
  const backgroundColor = hasBackgroundColor
    ? { r: data[ptr++], g: data[ptr++], b: data[ptr++] }
    : { ...secondaryColor }
  const effectSpeed = data[ptr++]
  const sleepTimeout = data[ptr++]
  const layerIndicatorMode = data[ptr++]
  const layerIndicatorKey = data[ptr++]

  const layerColors: HMK_RgbColor[] = []
  for (let i = 0; i < params.numLayers; i++) {
    layerColors.push({
      r: data[ptr++],
      g: data[ptr++],
      b: data[ptr++],
    })
  }

  const perKeyColors: HMK_RgbColor[] = []
  for (let i = 0; i < params.numKeys; i++) {
    perKeyColors.push({
      r: data[ptr++],
      g: data[ptr++],
      b: data[ptr++],
    })
  }

  const triggerStateColors: HMK_RgbColor[] = []
  for (let i = 0; i < RGB_TRIGGER_STATE_COLOR_COUNT; i++) {
    triggerStateColors.push({
      r: data[ptr++],
      g: data[ptr++],
      b: data[ptr++],
    })
  }

  return {
    enabled,
    globalBrightness,
    currentEffect,
    solidColor,
    secondaryColor,
    backgroundColor,
    effectSpeed,
    sleepTimeout,
    layerIndicatorMode,
    layerIndicatorKey,
    layerColors,
    perKeyColors,
    triggerStateColors,
  }
}

export type SetRgbConfigParams = {
  profile: number
  numKeys: number
  numLayers: number
  data: HMK_RgbConfig
  firmwareVersion?: number
}

export async function setRgbConfig(
  commander: Commander,
  params: SetRgbConfigParams,
) {
  const hasBackgroundColor = supportsBackgroundColor(params.firmwareVersion)
  const backgroundColor = params.data.backgroundColor ?? params.data.secondaryColor

  // Serialize to raw bytes
  const rawBytes: number[] = []
  rawBytes.push(params.data.enabled)
  rawBytes.push(params.data.globalBrightness)
  rawBytes.push(params.data.currentEffect)
  rawBytes.push(params.data.solidColor.r)
  rawBytes.push(params.data.solidColor.g)
  rawBytes.push(params.data.solidColor.b)
  rawBytes.push(params.data.secondaryColor.r)
  rawBytes.push(params.data.secondaryColor.g)
  rawBytes.push(params.data.secondaryColor.b)
  if (hasBackgroundColor) {
    rawBytes.push(backgroundColor.r)
    rawBytes.push(backgroundColor.g)
    rawBytes.push(backgroundColor.b)
  }
  rawBytes.push(params.data.effectSpeed)
  rawBytes.push(params.data.sleepTimeout)
  rawBytes.push(params.data.layerIndicatorMode)
  rawBytes.push(params.data.layerIndicatorKey)

  for (let i = 0; i < params.numLayers; i++) {
    const color = params.data.layerColors[i] || { r: 0, g: 0, b: 0 }
    rawBytes.push(color.r)
    rawBytes.push(color.g)
    rawBytes.push(color.b)
  }

  for (let i = 0; i < params.numKeys; i++) {
    // If array is short for some reason, pad with 0
    const color = params.data.perKeyColors[i] || { r: 0, g: 0, b: 0 }
    rawBytes.push(color.r)
    rawBytes.push(color.g)
    rawBytes.push(color.b)
  }

  for (let i = 0; i < RGB_TRIGGER_STATE_COLOR_COUNT; i++) {
    const color = params.data.triggerStateColors[i] || { r: 0, g: 0, b: 0 }
    rawBytes.push(color.r)
    rawBytes.push(color.g)
    rawBytes.push(color.b)
  }

  // Send chunks
  for (
    let offset = 0;
    offset < rawBytes.length;
    offset += GET_SET_RGB_CONFIG_MAX_ENTRIES
  ) {
    const chunk = rawBytes.slice(
      offset,
      offset + GET_SET_RGB_CONFIG_MAX_ENTRIES,
    )
    const len = chunk.length

    const payload = [params.profile, offset, len, ...chunk]
    // Pad to 62 bytes (3 byte header + 59 data)
    while (payload.length < 62) payload.push(0)

    const reader = new DataViewReader(
      await commander.sendCommand({
        command: HMK_Command.SET_RGB_CONFIG,
        payload,
      }),
    )

    const response = parseCommandOutBuffer(reader, HMK_Command.SET_RGB_CONFIG)
    if (response.commandId !== HMK_Command.SET_RGB_CONFIG) {
      throw new Error(`Failed to set RGB config for profile ${params.profile}`)
    }
  }
}
