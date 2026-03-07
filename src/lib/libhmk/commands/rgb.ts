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

// The firmware structure layout (matches rgb_config_t in rgb.h)
// uint8_t enabled;
// uint8_t global_brightness;
// uint8_t current_effect;
// rgb_color_t solid_color; (3 bytes)
// uint8_t effect_speed;
// rgb_color_t per_key_colors[NUM_KEYS]; (64 * 3 = 192 bytes)
//
// Total size: 1 + 1 + 1 + 3 + 1 + 192 = 199 bytes

export const rgbConfigSchema = z.object({
  enabled: z.number(),
  globalBrightness: z.number(),
  currentEffect: z.number(),
  solidColor: rgbColorSchema,
  effectSpeed: z.number(),
  perKeyColors: z.array(rgbColorSchema),
})

export type HMK_RgbConfig = z.infer<typeof rgbConfigSchema>

export const GET_SET_RGB_CONFIG_MAX_ENTRIES = 59
export const RGB_CONFIG_HEADER_SIZE = 7 // enabled(1) + brightness(1) + effect(1) + solidColor(3) + speed(1)

function rgbConfigSize(numKeys: number) {
  return RGB_CONFIG_HEADER_SIZE + numKeys * 3
}

export type GetRgbConfigParams = {
  profile: number
  numKeys: number
}

export async function getRgbConfig(
  commander: Commander,
  params: GetRgbConfigParams,
): Promise<HMK_RgbConfig> {
  const configSize = rgbConfigSize(params.numKeys)
  const data: number[] = []

  while (data.length < configSize) {
    const reader = new DataViewReader(
      await commander.sendCommand({
        command: HMK_Command.GET_RGB_CONFIG,
        payload: [params.profile, data.length, 0], // Offset in byte 2
      }),
    )

    const response = parseCommandOutBuffer(reader)

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
  const effectSpeed = data[ptr++]

  const perKeyColors: HMK_RgbColor[] = []
  for (let i = 0; i < params.numKeys; i++) {
    perKeyColors.push({
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
    effectSpeed,
    perKeyColors,
  }
}

export type SetRgbConfigParams = {
  profile: number
  numKeys: number
  data: HMK_RgbConfig
}

export async function setRgbConfig(
  commander: Commander,
  params: SetRgbConfigParams,
) {
  // Serialize to raw bytes
  const rawBytes: number[] = []
  rawBytes.push(params.data.enabled)
  rawBytes.push(params.data.globalBrightness)
  rawBytes.push(params.data.currentEffect)
  rawBytes.push(params.data.solidColor.r)
  rawBytes.push(params.data.solidColor.g)
  rawBytes.push(params.data.solidColor.b)
  rawBytes.push(params.data.effectSpeed)

  for (let i = 0; i < params.numKeys; i++) {
    // If array is short for some reason, pad with 0
    const color = params.data.perKeyColors[i] || { r: 0, g: 0, b: 0 }
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

    const response = parseCommandOutBuffer(reader)
    if (response.commandId !== HMK_Command.SET_RGB_CONFIG) {
      throw new Error(`Failed to set RGB config for profile ${params.profile}`)
    }
  }
}
