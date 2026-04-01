import type { HMK_RgbColor, HMK_RgbConfig } from "$lib/libhmk/commands/rgb"
import {
  RGB_EFFECT_ANALOG,
  RGB_EFFECT_BINARY_CLOCK,
  RGB_EFFECT_PER_KEY,
  RGB_EFFECT_TRIGGER_STATE,
  type TriggerPreviewState,
} from "./rgb-constants"

export type RgbPreviewPress = {
  ledIndex: number
  time: number
  strength: number
}

type RgbLedCoordinate = {
  x: number
  y: number
}

type RgbPreviewMetadata = {
  numKeys: number
  ledMap?: number[]
  ledCoords?: RgbLedCoordinate[]
  modLedIndices?: number[]
}

type BinaryClockLayout = {
  valid: boolean
  digitLeds: number[][]
  separatorLeds: number[]
  secondLeds: number[]
}

export function getRgbLedCount(metadata: RgbPreviewMetadata) {
  return metadata.ledMap?.length ?? metadata.numKeys
}

export function buildRgbLedIndexByKey(metadata: RgbPreviewMetadata) {
  const indices = Array<number | undefined>(metadata.numKeys).fill(undefined)
  metadata.ledMap?.forEach((keyIndex: number, ledIndex: number) => {
    indices[keyIndex] = ledIndex
  })
  return indices
}

export function getRgbLedCoordsByIndex(
  metadata: RgbPreviewMetadata,
  ledIndex: number,
) {
  return metadata.ledCoords?.[ledIndex] ?? { x: 0, y: 0 }
}

export function buildDigitalRainColumns(metadata: RgbPreviewMetadata) {
  const columns: { x: number; leds: number[] }[] = []

  for (let i = 0; i < getRgbLedCount(metadata); i++) {
    const point = getRgbLedCoordsByIndex(metadata, i)
    let column = columns.find((entry) => Math.abs(entry.x - point.x) <= 12)
    if (!column) {
      column = { x: point.x, leds: [] }
      columns.push(column)
    }
    column.leds.push(i)
  }

  for (const column of columns) {
    column.leds.sort(
      (left, right) =>
        getRgbLedCoordsByIndex(metadata, left).y -
        getRgbLedCoordsByIndex(metadata, right).y,
    )
  }

  return columns.map((column) => column.leds)
}

export function clamp8(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

export function wrap8(value: number) {
  return ((Math.floor(value) % 256) + 256) % 256
}

export function scale8(value: number, scale: number) {
  return ((value * (scale + 1)) >> 8) & 0xff
}

export function qsub8(a: number, b: number) {
  return a > b ? a - b : 0
}

export function qadd8(a: number, b: number) {
  return Math.min(255, a + b)
}

export function sin8(theta: number) {
  const radians = ((theta & 0xff) * 2 * Math.PI) / 256
  return clamp8(Math.sin(radians) * 127 + 128)
}

export function cos8(theta: number) {
  return sin8((theta + 64) & 0xff)
}

export function rgbToHue8(r: number, g: number, b: number) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return 0

  const delta = max - min
  let hue = 0
  if (max === r) hue = ((g - b) * 42) / delta
  else if (max === g) hue = ((b - r) * 42) / delta + 85
  else hue = ((r - g) * 42) / delta + 170
  if (hue < 0) hue += 255

  return clamp8(hue)
}

export function hsvToRgb(h: number, s: number, v: number) {
  h = wrap8(h)
  if (s === 0) return { r: v, g: v, b: v }

  const region = Math.floor(h / 43)
  const remainder = (h - region * 43) * 6
  const p = (v * (255 - s)) >> 8
  const q = (v * (255 - ((s * remainder) >> 8))) >> 8
  const t = (v * (255 - ((s * (255 - remainder)) >> 8))) >> 8

  switch (region) {
    case 0:
      return { r: v, g: t, b: p }
    case 1:
      return { r: q, g: v, b: p }
    case 2:
      return { r: p, g: v, b: t }
    case 3:
      return { r: p, g: q, b: v }
    case 4:
      return { r: t, g: p, b: v }
    default:
      return { r: v, g: p, b: q }
  }
}

export function rgbCss(r: number, g: number, b: number) {
  return `rgb(${clamp8(r)}, ${clamp8(g)}, ${clamp8(b)})`
}

export function scaleRgbColor(color: HMK_RgbColor, brightness: number) {
  return {
    r: (color.r * brightness) / 255,
    g: (color.g * brightness) / 255,
    b: (color.b * brightness) / 255,
  }
}

export function randomPixelColor(brightness: number) {
  return Math.random() < 0.5
    ? { r: 0, g: 0, b: 0 }
    : hsvToRgb(
        Math.floor(Math.random() * 256),
        127 + Math.floor(Math.random() * 128),
        brightness,
      )
}

export function randomDynamicColor(params: {
  effect: number
  tick: number
  brightness: number
  baseHue: number
  effectSpeed: number
}) {
  const { effect, tick, brightness, baseHue, effectSpeed } = params

  if (effect === 24) {
    const deltaH = (((baseHue + 128) & 0xff) - baseHue) / 4
    const hue = wrap8(baseHue + deltaH * Math.floor(Math.random() * 3))
    return hsvToRgb(hue, 255, brightness)
  }
  if (effect === 25) {
    return hsvToRgb(
      Math.floor(Math.random() * 256),
      127 + Math.floor(Math.random() * 128),
      brightness,
    )
  }

  const stTime = scale8(tick, effectSpeed >> 3)
  const stValue = scale8(Math.abs(sin8(stTime) - 128) * 2, brightness)

  if (effect === 48) {
    return hsvToRgb(
      (baseHue + Math.floor(Math.random() * 31)) & 0xff,
      255,
      stValue,
    )
  }
  if (effect === 49) {
    return hsvToRgb(
      baseHue,
      (255 + Math.floor(Math.random() * 31)) & 0xff,
      stValue,
    )
  }

  return hsvToRgb(baseHue, 255, stValue)
}

function buildBinaryClockLayout(metadata: RgbPreviewMetadata): BinaryClockLayout {
  const ledCount = getRgbLedCount(metadata)
  const uniqueY = Array.from(
    new Set(
      Array.from({ length: ledCount }, (_, ledIndex) =>
        getRgbLedCoordsByIndex(metadata, ledIndex).y,
      ),
    ),
  ).sort((left, right) => left - right)

  if (uniqueY.length < 3) {
    return {
      valid: false,
      digitLeds: [],
      separatorLeds: [],
      secondLeds: [],
    }
  }

  const rows = uniqueY.slice(0, 3).map((y) =>
    Array.from({ length: ledCount }, (_, ledIndex) => ledIndex)
      .filter((ledIndex) => getRgbLedCoordsByIndex(metadata, ledIndex).y === y)
      .sort(
        (left, right) =>
          getRgbLedCoordsByIndex(metadata, left).x -
          getRgbLedCoordsByIndex(metadata, right).x,
      ),
  )

  if (rows.some((row) => row.length < 10)) {
    return {
      valid: false,
      digitLeds: [],
      separatorLeds: [],
      secondLeds: [],
    }
  }

  const [topRow, middleRow, bottomRow] = rows
  return {
    valid: true,
    digitLeds: [
      topRow.slice(0, 4),
      middleRow.slice(0, 4),
      topRow.slice(-4),
      middleRow.slice(-4),
    ],
    separatorLeds: [
      topRow[4],
      topRow[topRow.length - 5],
      middleRow[4],
      middleRow[middleRow.length - 5],
    ],
    secondLeds: [...bottomRow.slice(0, 5), ...bottomRow.slice(-5)],
  }
}

function previewReactiveIntensity(params: {
  metadata: RgbPreviewMetadata
  previewPresses: RgbPreviewPress[]
  time: number
  ledIndex: number
  mode: "simple" | "wide" | "cross" | "nexus"
  multi: boolean
  speed: number
}) {
  const { metadata, previewPresses, time, ledIndex, mode, multi, speed } = params
  const sources = multi ? previewPresses : previewPresses.slice(-1)
  const point = getRgbLedCoordsByIndex(metadata, ledIndex)
  let best = 255

  for (const source of sources) {
    const ageFrames = time - source.time
    if (ageFrames < 0 || ageFrames > 60) continue

    const tick = clamp8((ageFrames * (qadd8(speed, 8) || 1)) / 2)
    const sourcePoint = getRgbLedCoordsByIndex(metadata, source.ledIndex)
    const dx = Math.abs(point.x - sourcePoint.x)
    const dy = Math.abs(point.y - sourcePoint.y)
    const distance = Math.hypot(dx, dy)

    let effect = tick
    if (mode === "wide") {
      effect = tick + distance * 5
    } else if (mode === "cross") {
      const cx = Math.min(255, dx * 16)
      const cy = Math.min(255, dy * 16)
      effect = tick + (cx > cy ? cy : cx)
    } else if (mode === "nexus") {
      effect = tick - distance
      if (distance > 72) effect = 255
      if (
        (point.x - sourcePoint.x > 8 || point.x - sourcePoint.x < -8) &&
        (point.y - sourcePoint.y > 8 || point.y - sourcePoint.y < -8)
      ) {
        effect = 255
      }
    }

    const clamped = effect < 0 ? 255 : clamp8(effect)
    if (clamped < best) best = clamped
  }

  return sources.length ? best : 255
}

function previewSplashIntensity(params: {
  metadata: RgbPreviewMetadata
  previewPresses: RgbPreviewPress[]
  time: number
  ledIndex: number
  multi: boolean
  speed: number
}) {
  const { metadata, previewPresses, time, ledIndex, multi, speed } = params
  const sources = multi ? previewPresses : previewPresses.slice(-1)
  const point = getRgbLedCoordsByIndex(metadata, ledIndex)
  let best = 255

  for (const source of sources) {
    const ageFrames = time - source.time
    if (ageFrames < 0 || ageFrames > 60) continue

    const tick = clamp8((ageFrames * (qadd8(speed, 8) || 1)) / 2)
    const sourcePoint = getRgbLedCoordsByIndex(metadata, source.ledIndex)
    const distance = Math.hypot(
      point.x - sourcePoint.x,
      point.y - sourcePoint.y,
    )
    const effect = tick - distance
    const clamped = effect < 0 ? 255 : clamp8(effect)
    if (clamped < best) best = clamped
  }

  return sources.length ? best : 255
}

function previewTriggerState(
  previewPresses: RgbPreviewPress[],
  time: number,
  ledIndex: number,
): TriggerPreviewState {
  for (let i = previewPresses.length - 1; i >= 0; i--) {
    const press = previewPresses[i]
    if (press.ledIndex !== ledIndex) continue

    const ageFrames = time - press.time
    if (ageFrames < 0) break
    if (ageFrames < 2) return "press"
    if (ageFrames < 4) return "hold"
    if (ageFrames < 7) return "release"
    break
  }

  return "idle"
}

type GetRgbPreviewLedColorParams = {
  rgbConfig: HMK_RgbConfig | null
  keyIndex: number
  ledIndexByKey: Array<number | undefined>
  metadata: RgbPreviewMetadata
  time: number
  previewHeatmap: number[]
  previewPresses: RgbPreviewPress[]
  previewDynamicColors: HMK_RgbColor[]
  previewPixelFlow: HMK_RgbColor[]
  previewPixelFractal: boolean[]
  previewDigitalRain: number[]
  triggerStateColor: (index: number) => HMK_RgbColor
}

export function getRgbPreviewLedColor(params: GetRgbPreviewLedColorParams) {
  const {
    rgbConfig,
    keyIndex,
    ledIndexByKey,
    metadata,
    time,
    previewHeatmap,
    previewPresses,
    previewDynamicColors,
    previewPixelFlow,
    previewPixelFractal,
    previewDigitalRain,
    triggerStateColor,
  } = params

  if (!rgbConfig || !rgbConfig.enabled) return "hsl(var(--muted))"
  const ledIndex = ledIndexByKey[keyIndex]
  if (ledIndex === undefined) return "transparent"

  const effect = rgbConfig.currentEffect
  if (effect === 0) return "transparent"

  const effectiveBrightness = rgbConfig.globalBrightness
  const baseR = rgbConfig.solidColor.r
  const baseG = rgbConfig.solidColor.g
  const baseB = rgbConfig.solidColor.b
  const secR = rgbConfig.secondaryColor.r
  const secG = rgbConfig.secondaryColor.g
  const secB = rgbConfig.secondaryColor.b
  const backgroundColor = rgbConfig.backgroundColor ?? rgbConfig.secondaryColor
  const baseHue = rgbToHue8(baseR, baseG, baseB)
  const secondaryHue = rgbToHue8(secR, secG, secB)

  const coords = metadata.ledCoords?.[ledIndex]
  const x = coords ? coords.x : 0
  const y = coords ? coords.y : 0

  const frame = time * 3
  const animTimer = Math.floor((frame * rgbConfig.effectSpeed * 16) / 128)
  const scaledTimer = frame * (rgbConfig.effectSpeed + 16)
  const tick = (scaledTimer >> 8) & 0xff

  switch (effect) {
    case 1: {
      return rgbCss(
        (baseR * effectiveBrightness) / 255,
        (baseG * effectiveBrightness) / 255,
        (baseB * effectiveBrightness) / 255,
      )
    }
    case 2: {
      const isMod =
        metadata.modLedIndices?.includes(ledIndex) ?? (x < 32 || x > 224)
      const color = isMod
        ? {
            r: (secR * effectiveBrightness) / 255,
            g: (secG * effectiveBrightness) / 255,
            b: (secB * effectiveBrightness) / 255,
          }
        : {
            r: (baseR * effectiveBrightness) / 255,
            g: (baseG * effectiveBrightness) / 255,
            b: (baseB * effectiveBrightness) / 255,
          }
      return rgbCss(color.r, color.g, color.b)
    }
    case 3:
    case 4: {
      const scale = scale8(64, rgbConfig.effectSpeed)
      const hue =
        effect === 3
          ? (baseHue + scale * (y >> 4)) & 0xff
          : (baseHue + ((scale * x) >> 5)) & 0xff
      const color = hsvToRgb(hue, 255, effectiveBrightness)
      return rgbCss(color.r, color.g, color.b)
    }
    case 5: {
      const pulse = (Math.abs(sin8((tick & 0xff) >> 1) - 128) * 2) & 0xff
      const color = hsvToRgb(baseHue, 255, scale8(pulse, effectiveBrightness))
      return rgbCss(color.r, color.g, color.b)
    }
    case 6:
    case 7: {
      const value = Math.max(0, 255 - Math.abs(x + 28 - tick) * 8)
      const color =
        effect === 6
          ? hsvToRgb(baseHue, clamp8(value), effectiveBrightness)
          : hsvToRgb(baseHue, 255, scale8(clamp8(value), effectiveBrightness))
      return rgbCss(color.r, color.g, color.b)
    }
    case 8:
    case 9:
    case 10:
    case 11: {
      const dx = x - 127
      const dy = y - 127
      const distance = Math.hypot(dx, dy)
      const angle = ((Math.atan2(dy, dx) + Math.PI) * 255) / (2 * Math.PI)
      const offset = effect === 10 || effect === 11 ? angle + distance : angle
      const value = Math.max(0, 255 - Math.abs(offset - tick) * 8)
      const color =
        effect === 8 || effect === 10
          ? hsvToRgb(baseHue, clamp8(value), effectiveBrightness)
          : hsvToRgb(baseHue, 255, scale8(clamp8(value), effectiveBrightness))
      return rgbCss(color.r, color.g, color.b)
    }
    case 12: {
      const color = hsvToRgb(tick, 255, effectiveBrightness)
      return rgbCss(color.r, color.g, color.b)
    }
    case 13:
    case 14: {
      const axis = effect === 13 ? x : y
      const hue = (axis - tick) & 0xff
      const color = hsvToRgb(hue, 255, effectiveBrightness)
      return rgbCss(color.r, color.g, color.b)
    }
    case 15:
    case 16: {
      const dx = x - 127
      const dy = y - 127
      const distance =
        effect === 16
          ? Math.hypot(127 / 2 - Math.abs(dx), dy)
          : Math.hypot(dx, dy)
      const hue =
        effect === 16
          ? wrap8(3 * distance + tick)
          : wrap8((3 * distance) / 2 + tick)
      const finalHue = effect === 16 && hue & 0x80 ? secondaryHue : hue
      const color = hsvToRgb(finalHue, 255, effectiveBrightness)
      return rgbCss(color.r, color.g, color.b)
    }
    case 17: {
      const hue = (baseHue + Math.abs(y - 127) + (x - tick)) & 0xff
      const color = hsvToRgb(hue, 255, effectiveBrightness)
      return rgbCss(color.r, color.g, color.b)
    }
    case 18:
    case 19: {
      const dx = x - 127
      const dy = y - 127
      const angle = ((Math.atan2(dy, dx) + Math.PI) * 255) / (2 * Math.PI)
      const distance = Math.hypot(dx, dy)
      const hue =
        effect === 19 ? wrap8(distance - tick - angle) : wrap8(angle + tick)
      const color = hsvToRgb(hue, 255, effectiveBrightness)
      return rgbCss(color.r, color.g, color.b)
    }
    case 20: {
      const sn = sin8(tick) - 128
      const cs = cos8(tick) - 128
      const dx = x - 127
      const dy = y - 127
      const projection = (dy * cs + dx * sn) / 128
      const hue = (baseHue + projection) & 0xff
      const color = hsvToRgb(hue, 255, effectiveBrightness)
      return rgbCss(color.r, color.g, color.b)
    }
    case 21: {
      const sn = sin8(tick) - 128
      const cs = cos8(tick) - 128
      const dx = x - 127
      const dy = y - 127
      const delta = (dy * 2 * cs + dx * 2 * sn) / 128
      const hue = (tick + delta) & 0xff
      const color = hsvToRgb(hue, 255, effectiveBrightness)
      return rgbCss(color.r, color.g, color.b)
    }
    case 22: {
      const sn = sin8(tick) - 128
      const cs = cos8(tick) - 128
      const dx = x - 127
      const dy = y - 127
      const absDx = Math.abs(dx)
      const delta = (dy * 3 * cs + (56 - absDx) * 3 * sn) / 128
      const hue = (tick + delta) & 0xff
      const color = hsvToRgb(hue, 255, effectiveBrightness)
      return rgbCss(color.r, color.g, color.b)
    }
    case 23: {
      const dx = x - 127
      const dy = y - 127
      const distance = Math.hypot(dx, dy)
      const phase = Math.floor(animTimer / 4) % 255
      const value = clamp8(
        127 + 127 * Math.sin(((phase - distance) * Math.PI) / 64),
      )
      const hue = (baseHue + distance) & 0xff
      const color = hsvToRgb(hue, 255, scale8(value, effectiveBrightness))
      return rgbCss(color.r, color.g, color.b)
    }
    case 24:
    case 25: {
      const color = previewDynamicColors[ledIndex] ?? { r: 0, g: 0, b: 0 }
      return color.r || color.g || color.b
        ? rgbCss(color.r, color.g, color.b)
        : "transparent"
    }
    case 26: {
      const delta = scale8(Math.abs(sin8(tick >> 1) - 128) * 2, 12)
      const hue = (baseHue + delta) & 0xff
      const color = hsvToRgb(hue, 255, effectiveBrightness)
      return rgbCss(color.r, color.g, color.b)
    }
    case 27: {
      const delta = scale8(Math.abs(sin8(tick) + x - 128) * 2, 12)
      const hue = (baseHue + delta) & 0xff
      const color = hsvToRgb(hue, 255, effectiveBrightness)
      return rgbCss(color.r, color.g, color.b)
    }
    case 28: {
      const hue = (baseHue + scale8(Math.abs(x - tick), 24)) & 0xff
      const color = hsvToRgb(hue, 255, effectiveBrightness)
      return rgbCss(color.r, color.g, color.b)
    }
    case 29:
    case 30: {
      if (effect === 29) {
        if (previewPixelFractal[ledIndex]) {
          const color = hsvToRgb(baseHue, 255, effectiveBrightness)
          return rgbCss(color.r, color.g, color.b)
        }
        return "transparent"
      }
      const color = previewPixelFlow[ledIndex] ?? { r: 0, g: 0, b: 0 }
      return color.r || color.g || color.b
        ? rgbCss(color.r, color.g, color.b)
        : "transparent"
    }
    case 31: {
      const color = previewDynamicColors[ledIndex] ?? { r: 0, g: 0, b: 0 }
      return color.r || color.g || color.b
        ? rgbCss(color.r, color.g, color.b)
        : "transparent"
    }
    case 32: {
      const temperature = clamp8(previewHeatmap[ledIndex] ?? 0)
      const hue = 170 - qsub8(temperature, 85)
      const heat = qsub8(qadd8(170, temperature), 170)
      const value = scale8(heat * 3, effectiveBrightness)
      const color = hsvToRgb(hue, 255, value)
      return temperature === 0 ? "transparent" : rgbCss(color.r, color.g, color.b)
    }
    case 33: {
      const value = previewDigitalRain[ledIndex] ?? 0
      const pureGreen = (effectiveBrightness * 3) >> 2
      if (value > pureGreen) {
        const boost = Math.floor(
          (pureGreen * (value - pureGreen)) /
            Math.max(1, effectiveBrightness - pureGreen),
        )
        return rgbCss(boost, effectiveBrightness, boost)
      }
      if (value > 0) {
        const green = Math.floor(
          (effectiveBrightness * value) / Math.max(1, pureGreen),
        )
        return rgbCss(0, green, 0)
      }
      return "transparent"
    }
    case 34:
    case 35:
    case 36:
    case 37:
    case 38:
    case 39:
    case 40:
    case 41: {
      const mode =
        effect === 36 || effect === 37
          ? "wide"
          : effect === 38 || effect === 39
            ? "cross"
            : effect === 40 || effect === 41
              ? "nexus"
              : "simple"
      const multi = effect === 37 || effect === 39 || effect === 41
      const reactiveEffect = previewReactiveIntensity({
        metadata,
        previewPresses,
        time,
        ledIndex,
        mode,
        multi,
        speed: rgbConfig.effectSpeed,
      })
      let hue = baseHue
      let value = effectiveBrightness
      if (effect === 34) value = scale8(255 - reactiveEffect, value)
      else if (effect === 35) {
        hue = (baseHue + scale8(255 - reactiveEffect, 64)) & 0xff
      } else {
        if (effect === 40 || effect === 41) hue = (baseHue + ((y - 127) >> 2)) & 0xff
        value = qadd8(value, 255 - reactiveEffect)
      }
      const color = hsvToRgb(hue, 255, value)
      return rgbCss(color.r, color.g, color.b)
    }
    case 42:
    case 43:
    case 44:
    case 45: {
      const multi = effect === 43 || effect === 45
      const splashEffect = previewSplashIntensity({
        metadata,
        previewPresses,
        time,
        ledIndex,
        multi,
        speed: rgbConfig.effectSpeed,
      })
      const hue =
        effect === 44 || effect === 45
          ? baseHue
          : (baseHue + splashEffect) & 0xff
      const value = qadd8(effectiveBrightness, 255 - splashEffect)
      const color = hsvToRgb(hue, 255, value)
      return rgbCss(color.r, color.g, color.b)
    }
    case 46:
    case 47:
    case 48:
    case 49: {
      const color = previewDynamicColors[ledIndex] ?? { r: 0, g: 0, b: 0 }
      return color.r || color.g || color.b
        ? rgbCss(color.r, color.g, color.b)
        : "transparent"
    }
    case 50: {
      const ledTime = (tick + ((ledIndex * 315) & 0xff)) & 0xff
      const value = scale8(Math.abs(sin8(ledTime) - 128) * 2, effectiveBrightness)
      const color = hsvToRgb(baseHue, 255, value)
      return rgbCss(color.r, color.g, color.b)
    }
    case RGB_EFFECT_ANALOG: {
      const distance = previewReactiveIntensity({
        metadata,
        previewPresses,
        time,
        ledIndex,
        mode: "simple",
        multi: true,
        speed: rgbConfig.effectSpeed,
      })
      const bgActiveR = (secR * effectiveBrightness) / 255
      const bgActiveG = (secG * effectiveBrightness) / 255
      const bgActiveB = (secB * effectiveBrightness) / 255
      const pressedR = (baseR * effectiveBrightness) / 255
      const pressedG = (baseG * effectiveBrightness) / 255
      const pressedB = (baseB * effectiveBrightness) / 255
      return rgbCss(
        (pressedR * distance + bgActiveR * (255 - distance)) / 255,
        (pressedG * distance + bgActiveG * (255 - distance)) / 255,
        (pressedB * distance + bgActiveB * (255 - distance)) / 255,
      )
    }
    case RGB_EFFECT_TRIGGER_STATE: {
      const state = previewTriggerState(previewPresses, time, ledIndex)
      const colorIndex =
        state === "press"
          ? 2
          : state === "hold"
            ? 3
            : state === "release"
              ? 1
              : 0
      const color = scaleRgbColor(
        triggerStateColor(colorIndex),
        effectiveBrightness,
      )
      return rgbCss(color.r, color.g, color.b)
    }
    case RGB_EFFECT_BINARY_CLOCK: {
      const layout = buildBinaryClockLayout(metadata)
      if (!layout.valid) {
        const pulse = ((Math.floor(time / 10) & 1) === 0 ? 1 : 0) * effectiveBrightness
        const color = scaleRgbColor(rgbConfig.solidColor, pulse)
        return pulse > 0 ? rgbCss(color.r, color.g, color.b) : "transparent"
      }

      const now = new Date()
      const hours = now.getHours()
      const minutes = now.getMinutes()
      const seconds = now.getSeconds()
      const digits = [
        Math.floor(hours / 10),
        hours % 10,
        Math.floor(minutes / 10),
        minutes % 10,
      ]
      const background = scaleRgbColor(
        backgroundColor,
        effectiveBrightness,
      )
      const accent = scaleRgbColor(rgbConfig.secondaryColor, effectiveBrightness)
      const head = scaleRgbColor(
        rgbConfig.solidColor,
        Math.floor((((seconds % 6) + 1) * effectiveBrightness) / 6),
      )

      for (let digitIndex = 0; digitIndex < layout.digitLeds.length; digitIndex++) {
        const bitIndex = layout.digitLeds[digitIndex].indexOf(ledIndex)
        if (bitIndex !== -1) {
          const isOn = (digits[digitIndex] & (1 << (3 - bitIndex))) !== 0
          const color = isOn
            ? {
                r: (baseR * effectiveBrightness) / 255,
                g: (baseG * effectiveBrightness) / 255,
                b: (baseB * effectiveBrightness) / 255,
              }
            : background
          return rgbCss(color.r, color.g, color.b)
        }
      }

      if (layout.separatorLeds.includes(ledIndex)) {
        const color = seconds % 2 === 0 ? accent : background
        return rgbCss(color.r, color.g, color.b)
      }

      const secondIndex = layout.secondLeds.indexOf(ledIndex)
      if (secondIndex !== -1) {
        const step = Math.floor(seconds / 6)
        const color =
          secondIndex < step
            ? accent
            : secondIndex === step
              ? head
              : background
        return rgbCss(color.r, color.g, color.b)
      }

      return rgbCss(background.r, background.g, background.b)
    }
    case RGB_EFFECT_PER_KEY: {
      const color = rgbConfig.perKeyColors[ledIndex] || { r: 0, g: 0, b: 0 }
      return rgbCss(
        (color.r * effectiveBrightness) / 255,
        (color.g * effectiveBrightness) / 255,
        (color.b * effectiveBrightness) / 255,
      )
    }
    default: {
      const hue = ((animTimer >> 4) + x) & 0xff
      const color = hsvToRgb(hue, 255, effectiveBrightness)
      return rgbCss(color.r, color.g, color.b)
    }
  }
}
