<script lang="ts">
  import FixedScrollArea from "$lib/components/fixed-scroll-area.svelte"
  import { KeyButton } from "$lib/components/key-button"
  import { KeyboardEditorKeyboard } from "$lib/components/keyboard-editor"
  import Switch from "$lib/components/switch.svelte"
  import * as Select from "$lib/components/ui/select"
  import { Slider } from "$lib/components/ui/slider"
  import { keyboardContext, type Keyboard } from "$lib/keyboard"
  import type { HMK_RgbConfig } from "$lib/libhmk/commands/rgb"
  import { cn, type WithoutChildren } from "$lib/utils"
  import type { HTMLAttributes } from "svelte/elements"
  import { globalStateContext } from "../context.svelte"

  const RGB_EFFECT_ANALOG = 51
  const RGB_EFFECT_PER_KEY = 52

  const {
    class: className,
    ...props
  }: WithoutChildren<HTMLAttributes<HTMLDivElement>> = $props()

  const keyboard = keyboardContext.get() as Keyboard
  const { metadata } = keyboard
  const { profile, tab } = $derived(globalStateContext.get())

  let rgbConfig = $state<HMK_RgbConfig | null>(null)
  let loading = $state(true)
  let selectedKeyIndex = $state<number | null>(null)

  $effect(() => {
    if (tab !== "rgb") return

    loading = true
    keyboard
      .getRgbConfig?.({ profile })
      .then((config) => {
        rgbConfig = config
      })
      .finally(() => {
        loading = false
      })
  })

  async function updateConfig(newConfig: Partial<HMK_RgbConfig>) {
    if (!rgbConfig) return
    const updated = { ...rgbConfig, ...newConfig }
    rgbConfig = updated
    await keyboard.setRgbConfig?.({ profile, data: updated })
  }

  function updateBrushColor(channel: "r" | "g" | "b", value: number) {
    if (!rgbConfig) return
    const newSolidColor = { ...rgbConfig.solidColor, [channel]: value }
    const updates: Partial<HMK_RgbConfig> = { solidColor: newSolidColor }

    if (
      rgbConfig.currentEffect === RGB_EFFECT_PER_KEY &&
      selectedKeyIndex !== null
    ) {
      const ledIndex = ledIndexByKey[selectedKeyIndex]
      if (ledIndex !== undefined) {
        const newPerKeyColors = [...rgbConfig.perKeyColors]
        newPerKeyColors[ledIndex] = newSolidColor
        updates.perKeyColors = newPerKeyColors
      }
    }
    updateConfig(updates)
  }

  function handleKeyClick(keyIndex: number) {
    if (!rgbConfig) return
    const ledIndex = ledIndexByKey[keyIndex]
    if (
      ledIndex !== undefined &&
      rgbConfig.currentEffect !== RGB_EFFECT_PER_KEY
    ) {
      previewPresses = [
        ...previewPresses.slice(-15),
        { ledIndex, time, strength: 255 },
      ]
      if (previewHeatmap.length === 0) {
        const n = metadata.ledMap?.length ?? metadata.numKeys
        previewHeatmap = Array(n).fill(0)
      }
      const next = [...previewHeatmap]
      next[ledIndex] = qadd8(next[ledIndex] ?? 0, 32)
      const p = ledCoordsByIndex(ledIndex)
      for (let i = 0; i < next.length; i++) {
        if (i === ledIndex) continue
        const q = ledCoordsByIndex(i)
        const dx = p.x - q.x
        const dy = p.y - q.y
        const distance = Math.hypot(dx, dy)
        if (distance <= 40) {
          const amount = Math.min(16, qsub8(40, clamp8(distance)))
          next[i] = qadd8(next[i] ?? 0, amount)
        }
      }
      previewHeatmap = next
    }
    if (rgbConfig.currentEffect === RGB_EFFECT_PER_KEY) {
      selectedKeyIndex = keyIndex
      const newPerKeyColors = [...rgbConfig.perKeyColors]
      if (ledIndex !== undefined) {
        newPerKeyColors[ledIndex] = { ...rgbConfig.solidColor }
        updateConfig({ perKeyColors: newPerKeyColors })
      }
    }
  }

  function fillAll() {
    if (!rgbConfig) return
    const newPerKeyColors = [...rgbConfig.perKeyColors]
    const numLeds = metadata.ledMap?.length ?? metadata.numKeys
    for (let i = 0; i < numLeds; i++) {
      newPerKeyColors[i] = { ...rgbConfig.solidColor }
    }
    updateConfig({ perKeyColors: newPerKeyColors })
  }

  function clearAll() {
    if (!rgbConfig) return
    const newPerKeyColors = [...rgbConfig.perKeyColors]
    const numLeds = metadata.ledMap?.length ?? metadata.numKeys
    for (let i = 0; i < numLeds; i++) {
      newPerKeyColors[i] = { r: 0, g: 0, b: 0 }
    }
    updateConfig({ perKeyColors: newPerKeyColors })
  }

  const effects = [
    { value: "0", label: "Off" },
    { value: "1", label: "Solid Color" },
    { value: "2", label: "Alphas Mods" },
    { value: "3", label: "Gradient Up Down" },
    { value: "4", label: "Gradient Left Right" },
    { value: "5", label: "Breathing" },
    { value: "6", label: "Band Saturation" },
    { value: "7", label: "Band Value" },
    { value: "8", label: "Band Pinwheel Saturation" },
    { value: "9", label: "Band Pinwheel Value" },
    { value: "10", label: "Band Spiral Saturation" },
    { value: "11", label: "Band Spiral Value" },
    { value: "12", label: "Cycle All" },
    { value: "13", label: "Cycle Left Right" },
    { value: "14", label: "Cycle Up Down" },
    { value: "15", label: "Cycle Out In" },
    { value: "16", label: "Cycle Out In Dual" },
    { value: "17", label: "Rainbow Moving Chevron" },
    { value: "18", label: "Cycle Pinwheel" },
    { value: "19", label: "Cycle Spiral" },
    { value: "20", label: "Dual Beacon" },
    { value: "21", label: "Rainbow Beacon" },
    { value: "22", label: "Rainbow Pinwheels" },
    { value: "23", label: "Flower Blooming" },
    { value: "24", label: "Raindrops" },
    { value: "25", label: "Jellybean Raindrops" },
    { value: "26", label: "Hue Breathing" },
    { value: "27", label: "Hue Pendulum" },
    { value: "28", label: "Hue Wave" },
    { value: "29", label: "Pixel Fractal" },
    { value: "30", label: "Pixel Flow" },
    { value: "31", label: "Pixel Rain" },
    { value: "32", label: "Typing Heatmap" },
    { value: "33", label: "Digital Rain" },
    { value: "34", label: "Solid Reactive Simple" },
    { value: "35", label: "Solid Reactive" },
    { value: "36", label: "Solid Reactive Wide" },
    { value: "37", label: "Solid Reactive Multi-Wide" },
    { value: "38", label: "Solid Reactive Cross" },
    { value: "39", label: "Solid Reactive Multi-Cross" },
    { value: "40", label: "Solid Reactive Nexus" },
    { value: "41", label: "Solid Reactive Multi-Nexus" },
    { value: "42", label: "Splash" },
    { value: "43", label: "Multi-Splash" },
    { value: "44", label: "Solid Splash" },
    { value: "45", label: "Solid Multi-Splash" },
    { value: "46", label: "Starlight" },
    { value: "47", label: "Starlight Smooth" },
    { value: "48", label: "Starlight Dual Hue" },
    { value: "49", label: "Starlight Dual Saturation" },
    { value: "50", label: "Riverflow" },
    { value: "51", label: "Analog Keypress" },
    { value: "52", label: "Per-Key / Static" },
  ]
  const ledIndexByKey = $derived.by(() => {
    const indices = Array<number | undefined>(metadata.numKeys).fill(undefined)
    metadata.ledMap?.forEach((keyIndex: number, ledIndex: number) => {
      indices[keyIndex] = ledIndex
    })
    return indices
  })

  // Animation State
  let time = $state(0)
  let previewHeatmap = $state<number[]>([])
  let previewPresses = $state<
    { ledIndex: number; time: number; strength: number }[]
  >([])
  let previewDynamicColors = $state<{ r: number; g: number; b: number }[]>([])
  let previewPixelFlow = $state<{ r: number; g: number; b: number }[]>([])
  let previewPixelFractal = $state<boolean[]>([])
  let previewDigitalRain = $state<number[]>([])
  let previewDigitalRainCols = $state<number[][]>([])
  let previewPixelRainIndex = 0
  let previewPixelFlowWait = 0
  let previewPixelFractalWait = 0
  let previewPixelRainWait = 0
  let previewDigitalDrop = 0
  let previewDigitalDecay = 0
  let lastRandomTick = 0
  let lastEffect = -1

  function ledCount() {
    return metadata.ledMap?.length ?? metadata.numKeys
  }

  function ensurePreviewArrays() {
    const n = ledCount()
    if (previewHeatmap.length !== n) previewHeatmap = Array(n).fill(0)
    if (previewDynamicColors.length !== n) {
      previewDynamicColors = Array.from({ length: n }, () => ({
        r: 0,
        g: 0,
        b: 0,
      }))
    }
    if (previewPixelFlow.length !== n)
      previewPixelFlow = Array.from({ length: n }, () => ({ r: 0, g: 0, b: 0 }))
    if (previewPixelFractal.length !== n)
      previewPixelFractal = Array(n).fill(false)
    if (previewDigitalRain.length !== n) previewDigitalRain = Array(n).fill(0)
  }

  function buildDigitalRainColumns() {
    const cols: { x: number; leds: number[] }[] = []
    for (let i = 0; i < ledCount(); i++) {
      const p = ledCoordsByIndex(i)
      let col = cols.find((c) => Math.abs(c.x - p.x) <= 12)
      if (!col) {
        col = { x: p.x, leds: [] }
        cols.push(col)
      }
      col.leds.push(i)
    }
    for (const c of cols) {
      c.leds.sort((a, b) => ledCoordsByIndex(a).y - ledCoordsByIndex(b).y)
    }
    previewDigitalRainCols = cols.map((c) => c.leds)
  }

  function randomPixelColor(brightness: number) {
    return Math.random() < 0.5
      ? { r: 0, g: 0, b: 0 }
      : hsvToRgb(
          Math.floor(Math.random() * 256),
          127 + Math.floor(Math.random() * 128),
          brightness,
        )
  }

  function randomDynamicColor(
    effect: number,
    tick: number,
    brightness: number,
    baseHue: number,
  ) {
    if (effect === 24) {
      const deltaH = (((baseHue + 128) & 0xff) - baseHue) / 4
      const h = wrap8(baseHue + deltaH * Math.floor(Math.random() * 3))
      return hsvToRgb(h, 255, brightness)
    }
    if (effect === 25) {
      return hsvToRgb(
        Math.floor(Math.random() * 256),
        127 + Math.floor(Math.random() * 128),
        brightness,
      )
    }
    const stTime = scale8(
      tick,
      rgbConfig?.effectSpeed ? rgbConfig.effectSpeed >> 3 : 0,
    )
    const stV = scale8(Math.abs(sin8(stTime) - 128) * 2, brightness)
    if (effect === 48)
      return hsvToRgb(
        (baseHue + Math.floor(Math.random() * 31)) & 0xff,
        255,
        stV,
      )
    if (effect === 49)
      return hsvToRgb(
        baseHue,
        (255 + Math.floor(Math.random() * 31)) & 0xff,
        stV,
      )
    return hsvToRgb(baseHue, 255, stV)
  }

  $effect(() => {
    if (tab === "rgb" && rgbConfig?.enabled && rgbConfig.currentEffect > 1) {
      const interval = setInterval(() => {
        if (!rgbConfig) return
        time += 1
        ensurePreviewArrays()
        previewPresses = previewPresses.filter((p) => time - p.time < 50)
        previewHeatmap = previewHeatmap.map((h) => qsub8(h, 2))
        const effectChanged = lastEffect !== rgbConfig.currentEffect

        if (effectChanged) {
          previewDynamicColors = previewDynamicColors.map(() => ({
            r: 0,
            g: 0,
            b: 0,
          }))
          previewPixelFlow = previewPixelFlow.map(() => ({ r: 0, g: 0, b: 0 }))
          previewPixelFractal = previewPixelFractal.map(() => false)
          previewDigitalRain = previewDigitalRain.map(() => 0)
          previewPixelRainIndex = Math.floor(Math.random() * ledCount())
          previewPixelFlowWait = time
          previewPixelFractalWait = time
          previewPixelRainWait = time
          previewDigitalDrop = 0
          previewDigitalDecay = 0
          buildDigitalRainColumns()
          lastRandomTick = 0
          lastEffect = rgbConfig.currentEffect
        }

        // Random-trigger effects (QMK-like raindrops / starlight families)
        if ([24, 25, 46, 47, 48, 49].includes(rgbConfig.currentEffect)) {
          const speedFactor = rgbConfig.effectSpeed + 16
          // Svelte intervals are 50ms (~3.1 firmware frames at 60fps)
          const scaledTimer = time * 3 * speedFactor
          const tick = Math.floor(scaledTimer / 256)
          const baseHue = rgbToHue8(
            rgbConfig.solidColor.r,
            rgbConfig.solidColor.g,
            rgbConfig.solidColor.b,
          )
          const effect = rgbConfig.currentEffect

          if (effectChanged) {
            previewDynamicColors = previewDynamicColors.map(() =>
              randomDynamicColor(
                effect,
                tick,
                rgbConfig!.globalBrightness,
                baseHue,
              ),
            )
          }

          const period = effect === 24 ? 10 : 5
          if (tick % period === 0 && tick !== lastRandomTick) {
            const index = Math.floor(Math.random() * ledCount())
            const c = randomDynamicColor(
              effect,
              tick,
              rgbConfig.globalBrightness,
              baseHue,
            )
            previewDynamicColors[index] = c
            previewDynamicColors = [...previewDynamicColors]
            lastRandomTick = tick
          }
        }

        if (rgbConfig.currentEffect === 30) {
          const denom = Math.max(
            1,
            scale8(qadd8(rgbConfig.effectSpeed, 16), 16),
          )
          const intervalFrames = Math.max(1, Math.floor(3000 / denom / 50))
          if (time - previewPixelFlowWait >= intervalFrames) {
            previewPixelFlow = [
              ...previewPixelFlow.slice(1),
              randomPixelColor(rgbConfig.globalBrightness),
            ]
            previewPixelFlowWait = time
          }
        }
        if (rgbConfig.currentEffect === 29) {
          const denom = Math.max(
            1,
            scale8(qadd8(rgbConfig.effectSpeed, 16), 16),
          )
          const intervalFrames = Math.max(1, Math.floor(3000 / denom / 50))
          if (time - previewPixelFractalWait >= intervalFrames) {
            const n = ledCount()
            const next = Array(n).fill(false)
            const half = Math.floor(n / 2)
            for (let i = 0; i < half; i++) {
              const bit =
                i + 1 < half ? previewPixelFractal[i + 1] : Math.random() < 0.25
              next[i] = bit
              next[n - 1 - i] = bit
            }
            if (n % 2 === 1) next[half] = Math.random() < 0.25
            previewPixelFractal = next
            previewPixelFractalWait = time
          }
        }
        if (rgbConfig.currentEffect === 31) {
          const delayMs = 2048 - ((1792 * (rgbConfig.effectSpeed + 1)) >> 8)
          const delayFrames = Math.max(1, Math.floor(delayMs / 50))
          if (time - previewPixelRainWait >= delayFrames) {
            previewPixelRainIndex = Math.floor(Math.random() * ledCount())
            previewDynamicColors = previewDynamicColors.map(() => ({
              r: 0,
              g: 0,
              b: 0,
            }))
            previewDynamicColors[previewPixelRainIndex] = randomPixelColor(
              rgbConfig.globalBrightness,
            )
            previewDynamicColors = [...previewDynamicColors]
            previewPixelRainWait = time
          }
        }
        if (rgbConfig.currentEffect === 33) {
          const max = rgbConfig.globalBrightness
          const decayTicks = Math.max(1, Math.floor(255 / Math.max(1, max)))
          previewDigitalDecay += 1
          const next = [...previewDigitalRain]
          if (previewDigitalDrop === 0) {
            for (const col of previewDigitalRainCols) {
              if (col.length > 0 && Math.random() < 1 / 24) {
                const top = col[0]
                next[top] = max
              }
            }
          }
          for (let i = 0; i < next.length; i++) {
            if (
              next[i] > 0 &&
              next[i] < max &&
              previewDigitalDecay >= decayTicks
            )
              next[i] -= 1
          }
          if (previewDigitalDecay >= decayTicks) previewDigitalDecay = 0
          previewDigitalDrop += 1
          if (previewDigitalDrop > 28) {
            previewDigitalDrop = 0
            for (const col of previewDigitalRainCols) {
              if (col.length === 0) continue
              const bottom = col[col.length - 1]
              if (next[bottom] === max) next[bottom] = Math.max(0, max - 1)
              for (let j = col.length - 1; j > 0; j--) {
                const below = col[j]
                const above = col[j - 1]
                if (next[above] >= max) {
                  next[above] = Math.max(0, max - 1)
                  next[below] = max
                }
              }
            }
          }
          previewDigitalRain = next
        }
      }, 50)
      return () => clearInterval(interval)
    }
  })

  function clamp8(v: number) {
    return Math.max(0, Math.min(255, Math.round(v)))
  }
  function wrap8(v: number) {
    return ((Math.floor(v) % 256) + 256) % 256
  }

  function scale8(value: number, scale: number) {
    return ((value * (scale + 1)) >> 8) & 0xff
  }

  function qsub8(a: number, b: number) {
    return a > b ? a - b : 0
  }
  function qadd8(a: number, b: number) {
    return Math.min(255, a + b)
  }

  function sin8(theta: number) {
    const rad = ((theta & 0xff) * 2 * Math.PI) / 256
    return clamp8(Math.sin(rad) * 127 + 128)
  }

  function cos8(theta: number) {
    return sin8((theta + 64) & 0xff)
  }

  function rgbToHue8(r: number, g: number, b: number) {
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    if (max === min) return 0
    const d = max - min
    let h = 0
    if (max === r) h = ((g - b) * 42) / d
    else if (max === g) h = ((b - r) * 42) / d + 85
    else h = ((r - g) * 42) / d + 170
    if (h < 0) h += 255
    return clamp8(h)
  }

  function hsvToRgb(h: number, s: number, v: number) {
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

  function rgbCss(r: number, g: number, b: number) {
    return `rgb(${clamp8(r)}, ${clamp8(g)}, ${clamp8(b)})`
  }

  function ledCoordsByIndex(ledIndex: number) {
    return metadata.ledCoords?.[ledIndex] ?? { x: 0, y: 0 }
  }

  function previewReactiveIntensity(
    ledIndex: number,
    mode: "simple" | "wide" | "cross" | "nexus",
    multi: boolean,
    speed: number,
  ) {
    const sources = multi ? previewPresses : previewPresses.slice(-1)
    const p = ledCoordsByIndex(ledIndex)
    let best = 255
    for (const src of sources) {
      const ageFrames = time - src.time
      if (ageFrames < 0 || ageFrames > 60) continue
      // Preview cadence is slower than firmware ticks; scale down so the reaction is visible.
      const tick = clamp8((ageFrames * (qadd8(speed, 8) || 1)) / 2)
      const s = ledCoordsByIndex(src.ledIndex)
      const dx = Math.abs(p.x - s.x)
      const dy = Math.abs(p.y - s.y)
      const dist = Math.hypot(dx, dy)

      let effect = tick
      if (mode === "simple") effect = tick
      else if (mode === "wide") effect = tick + dist * 5
      else if (mode === "cross") {
        const cx = Math.min(255, dx * 16)
        const cy = Math.min(255, dy * 16)
        effect = tick + (cx > cy ? cy : cx)
      } else {
        effect = tick - dist
        if (dist > 72) effect = 255
        if (
          (p.x - s.x > 8 || p.x - s.x < -8) &&
          (p.y - s.y > 8 || p.y - s.y < -8)
        ) {
          effect = 255
        }
      }
      const clamped = effect < 0 ? 255 : clamp8(effect)
      if (clamped < best) best = clamped
    }
    return sources.length ? best : 255
  }

  function previewSplashIntensity(
    ledIndex: number,
    multi: boolean,
    speed: number,
  ) {
    const sources = multi ? previewPresses : previewPresses.slice(-1)
    const p = ledCoordsByIndex(ledIndex)
    let best = 255
    for (const src of sources) {
      const ageFrames = time - src.time
      if (ageFrames < 0 || ageFrames > 60) continue
      // Preview cadence is slower than firmware ticks; scale down so the reaction is visible.
      const tick = clamp8((ageFrames * (qadd8(speed, 8) || 1)) / 2)
      const s = ledCoordsByIndex(src.ledIndex)
      const dist = Math.hypot(p.x - s.x, p.y - s.y)
      const effect = tick - dist
      const clamped = effect < 0 ? 255 : clamp8(effect)
      if (clamped < best) best = clamped
    }
    return sources.length ? best : 255
  }

  function getLedColor(keyIndex: number) {
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
        const r = (baseR * effectiveBrightness) / 255
        const g = (baseG * effectiveBrightness) / 255
        const b = (baseB * effectiveBrightness) / 255
        return rgbCss(r, g, b)
      }
      case 2: {
        const isMod =
          metadata.modLedIndices?.includes(ledIndex) ?? (x < 32 || x > 224)
        const c = isMod
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
        return rgbCss(c.r, c.g, c.b)
      }
      case 3:
      case 4: {
        const scale = scale8(64, rgbConfig.effectSpeed)
        const h =
          effect === 3
            ? (baseHue + scale * (y >> 4)) & 0xff
            : (baseHue + ((scale * x) >> 5)) & 0xff
        const c = hsvToRgb(h, 255, effectiveBrightness)
        return rgbCss(c.r, c.g, c.b)
      }
      case 5: {
        const t8 = tick & 0xff
        const pulse = (Math.abs(sin8(t8 >> 1) - 128) * 2) & 0xff
        const c = hsvToRgb(baseHue, 255, scale8(pulse, effectiveBrightness))
        return rgbCss(c.r, c.g, c.b)
      }
      case 6:
      case 7: {
        const val = Math.max(0, 255 - Math.abs(x + 28 - tick) * 8)
        const c =
          effect === 6
            ? hsvToRgb(baseHue, clamp8(val), effectiveBrightness)
            : hsvToRgb(baseHue, 255, scale8(clamp8(val), effectiveBrightness))
        return rgbCss(c.r, c.g, c.b)
      }
      case 8:
      case 9:
      case 10:
      case 11: {
        const dx = x - 127
        const dy = y - 127
        const dist = Math.hypot(dx, dy)
        const angle = ((Math.atan2(dy, dx) + Math.PI) * 255) / (2 * Math.PI)
        const offset = effect === 10 || effect === 11 ? angle + dist : angle
        const val = Math.max(0, 255 - Math.abs(offset - tick) * 8)
        const c =
          effect === 8 || effect === 10
            ? hsvToRgb(baseHue, clamp8(val), effectiveBrightness)
            : hsvToRgb(baseHue, 255, scale8(clamp8(val), effectiveBrightness))
        return rgbCss(c.r, c.g, c.b)
      }
      case 12: {
        const c = hsvToRgb(tick, 255, effectiveBrightness)
        return rgbCss(c.r, c.g, c.b)
      }
      case 13:
      case 14: {
        const axis = effect === 13 ? x : y
        const h = (axis - tick) & 0xff
        const c = hsvToRgb(h, 255, effectiveBrightness)
        return rgbCss(c.r, c.g, c.b)
      }
      case 15:
      case 16: {
        const dx = x - 127
        const dy = y - 127
        const dist =
          effect === 16
            ? Math.hypot(127 / 2 - Math.abs(dx), dy)
            : Math.hypot(dx, dy)
        const h =
          effect === 16 ? wrap8(3 * dist + tick) : wrap8((3 * dist) / 2 + tick)
        const finalH = effect === 16 && h & 0x80 ? secondaryHue : h
        const c = hsvToRgb(finalH, 255, effectiveBrightness)
        return rgbCss(c.r, c.g, c.b)
      }
      case 17: {
        const h = (baseHue + Math.abs(y - 127) + (x - tick)) & 0xff
        const c = hsvToRgb(h, 255, effectiveBrightness)
        return rgbCss(c.r, c.g, c.b)
      }
      case 18:
      case 19: {
        const dx = x - 127
        const dy = y - 127
        const angle = ((Math.atan2(dy, dx) + Math.PI) * 255) / (2 * Math.PI)
        const dist = Math.hypot(dx, dy)
        const h =
          effect === 19 ? wrap8(dist - tick - angle) : wrap8(angle + tick)
        const c = hsvToRgb(h, 255, effectiveBrightness)
        return rgbCss(c.r, c.g, c.b)
      }
      case 20: {
        const sn = sin8(tick) - 128
        const cs = cos8(tick) - 128
        const dx = x - 127
        const dy = y - 127
        const proj = (dy * cs + dx * sn) / 128
        const h = (baseHue + proj) & 0xff
        const c = hsvToRgb(h, 255, effectiveBrightness)
        return rgbCss(c.r, c.g, c.b)
      }
      case 21: {
        const sn = sin8(tick) - 128
        const cs = cos8(tick) - 128
        const dx = x - 127
        const dy = y - 127
        const delta = (dy * 2 * cs + dx * 2 * sn) / 128
        const h = (tick + delta) & 0xff
        const c = hsvToRgb(h, 255, effectiveBrightness)
        return rgbCss(c.r, c.g, c.b)
      }
      case 22: {
        const sn = sin8(tick) - 128
        const cs = cos8(tick) - 128
        const dx = x - 127
        const dy = y - 127
        const adx = Math.abs(dx)
        const delta = (dy * 3 * cs + (56 - adx) * 3 * sn) / 128
        const h = (tick + delta) & 0xff
        const c = hsvToRgb(h, 255, effectiveBrightness)
        return rgbCss(c.r, c.g, c.b)
      }
      case 23: {
        const dx = x - 127
        const dy = y - 127
        const dist = Math.hypot(dx, dy)
        const phase = Math.floor(animTimer / 4) % 255
        const v = clamp8(127 + 127 * Math.sin(((phase - dist) * Math.PI) / 64))
        const h = (baseHue + dist) & 0xff
        const c = hsvToRgb(h, 255, scale8(v, effectiveBrightness))
        return rgbCss(c.r, c.g, c.b)
      }
      case 24:
      case 25: {
        const c = previewDynamicColors[ledIndex] ?? { r: 0, g: 0, b: 0 }
        return c.r || c.g || c.b ? rgbCss(c.r, c.g, c.b) : "transparent"
      }
      case 26: {
        const delta = scale8(Math.abs(sin8(tick >> 1) - 128) * 2, 12)
        const h = (baseHue + delta) & 0xff
        const c = hsvToRgb(h, 255, effectiveBrightness)
        return rgbCss(c.r, c.g, c.b)
      }
      case 27: {
        const delta = scale8(Math.abs(sin8(tick) + x - 128) * 2, 12)
        const h = (baseHue + delta) & 0xff
        const c = hsvToRgb(h, 255, effectiveBrightness)
        return rgbCss(c.r, c.g, c.b)
      }
      case 28: {
        const h = (baseHue + scale8(Math.abs(x - tick), 24)) & 0xff
        const c = hsvToRgb(h, 255, effectiveBrightness)
        return rgbCss(c.r, c.g, c.b)
      }
      case 29:
      case 30: {
        if (effect === 29) {
          if (previewPixelFractal[ledIndex]) {
            const c = hsvToRgb(baseHue, 255, effectiveBrightness)
            return rgbCss(c.r, c.g, c.b)
          }
          return "transparent"
        }
        const c = previewPixelFlow[ledIndex] ?? { r: 0, g: 0, b: 0 }
        return c.r || c.g || c.b ? rgbCss(c.r, c.g, c.b) : "transparent"
      }
      case 31: {
        const c = previewDynamicColors[ledIndex] ?? { r: 0, g: 0, b: 0 }
        return c.r || c.g || c.b ? rgbCss(c.r, c.g, c.b) : "transparent"
      }
      case 32: {
        const temp = clamp8(previewHeatmap[ledIndex] ?? 0)
        const hue = 170 - qsub8(temp, 85)
        const heat = qsub8(qadd8(170, temp), 170)
        const v = scale8(heat * 3, effectiveBrightness)
        const c = hsvToRgb(hue, 255, v)
        return temp === 0 ? "transparent" : rgbCss(c.r, c.g, c.b)
      }
      case 33: {
        const val = previewDigitalRain[ledIndex] ?? 0
        const pureGreen = (effectiveBrightness * 3) >> 2
        if (val > pureGreen) {
          const boost = Math.floor(
            (((effectiveBrightness * 3) >> 2) * (val - pureGreen)) /
              Math.max(1, effectiveBrightness - pureGreen),
          )
          return rgbCss(boost, effectiveBrightness, boost)
        }
        if (val > 0) {
          const green = Math.floor(
            (effectiveBrightness * val) / Math.max(1, pureGreen),
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
        const reactiveEffect = previewReactiveIntensity(
          ledIndex,
          mode,
          multi,
          rgbConfig.effectSpeed,
        )
        let h = baseHue
        let v = effectiveBrightness
        if (effect === 34) v = scale8(255 - reactiveEffect, v)
        else if (effect === 35)
          h = (baseHue + scale8(255 - reactiveEffect, 64)) & 0xff
        else {
          if (effect === 40 || effect === 41)
            h = (baseHue + ((y - 127) >> 2)) & 0xff
          else h = baseHue
          v = qadd8(v, 255 - reactiveEffect)
        }
        const c = hsvToRgb(h, 255, v)
        return rgbCss(c.r, c.g, c.b)
      }
      case 42:
      case 43:
      case 44:
      case 45: {
        const multi = effect === 43 || effect === 45
        const splashEffect = previewSplashIntensity(
          ledIndex,
          multi,
          rgbConfig.effectSpeed,
        )
        const h =
          effect === 44 || effect === 45
            ? baseHue
            : (baseHue + splashEffect) & 0xff
        const v = qadd8(effectiveBrightness, 255 - splashEffect)
        const c = hsvToRgb(h, 255, v)
        return rgbCss(c.r, c.g, c.b)
      }
      case 46:
      case 47: {
        const c = previewDynamicColors[ledIndex] ?? { r: 0, g: 0, b: 0 }
        return c.r || c.g || c.b ? rgbCss(c.r, c.g, c.b) : "transparent"
      }
      case 48:
      case 49: {
        const c = previewDynamicColors[ledIndex] ?? { r: 0, g: 0, b: 0 }
        return c.r || c.g || c.b ? rgbCss(c.r, c.g, c.b) : "transparent"
      }
      case 50: {
        const ledTime = (tick + ((ledIndex * 315) & 0xff)) & 0xff
        const v = scale8(Math.abs(sin8(ledTime) - 128) * 2, effectiveBrightness)
        const c = hsvToRgb(baseHue, 255, v)
        return rgbCss(c.r, c.g, c.b)
      }
      case RGB_EFFECT_ANALOG: {
        const dist = previewReactiveIntensity(
          ledIndex,
          "simple",
          true,
          rgbConfig.effectSpeed,
        )
        const bgR = (secR * effectiveBrightness) / 255
        const bgG = (secG * effectiveBrightness) / 255
        const bgB = (secB * effectiveBrightness) / 255
        const pressedR = (baseR * effectiveBrightness) / 255
        const pressedG = (baseG * effectiveBrightness) / 255
        const pressedB = (baseB * effectiveBrightness) / 255
        return rgbCss(
          (pressedR * dist + bgR * (255 - dist)) / 255,
          (pressedG * dist + bgG * (255 - dist)) / 255,
          (pressedB * dist + bgB * (255 - dist)) / 255,
        )
      }
      case RGB_EFFECT_PER_KEY: {
        const color = rgbConfig.perKeyColors[ledIndex] || { r: 0, g: 0, b: 0 }
        const r = (color.r * effectiveBrightness) / 255
        const g = (color.g * effectiveBrightness) / 255
        const b = (color.b * effectiveBrightness) / 255
        return rgbCss(r, g, b)
      }
      default: {
        const h = ((animTimer >> 4) + x) & 0xff
        const c = hsvToRgb(h, 255, effectiveBrightness)
        return rgbCss(c.r, c.g, c.b)
      }
    }
  }
</script>

<div
  class={cn("mx-auto flex size-full max-w-3xl flex-col", className)}
  {...props}
>
  <FixedScrollArea class="flex flex-col gap-6 p-4">
    {#if loading || !rgbConfig}
      <p class="text-muted-foreground">Loading RGB configuration...</p>
    {:else}
      <!-- Layout RGB Preview -->
      <div
        class="relative h-64 w-full overflow-hidden rounded-xl border bg-muted/20 transition-colors"
      >
        <KeyboardEditorKeyboard class="relative z-10 size-full">
          {#snippet keyGenerator(key, isJoystick)}
            {@const color = getLedColor(key)}
            {@const isSelected = selectedKeyIndex === key}
            <KeyButton
              onclick={() => handleKeyClick(key)}
              class={cn(
                "transition-all duration-300",
                isJoystick ? "rounded-full" : "",
                color === "transparent" ? "opacity-20" : "",
                isSelected &&
                  "z-20 scale-110 !border-2 !border-primary ring-2 ring-primary/50",
              )}
              style="background-color: {color}; box-shadow: {color !==
                'transparent' && color !== 'hsl(var(--muted))'
                ? `0 0 10px ${color}`
                : 'none'}"
            />
          {/snippet}
        </KeyboardEditorKeyboard>
      </div>

      <!-- Enable/Disable -->
      <Switch
        bind:checked={
          () => rgbConfig!.enabled === 1,
          (v) => updateConfig({ enabled: v ? 1 : 0 })
        }
        id="rgb-enabled"
        title="Enable RGB Lighting"
        description="Turn all LEDs on or off."
      />

      <!-- Effect Selection -->
      <div class="flex flex-col gap-2">
        <div class="grid text-sm text-wrap">
          <span class="font-semibold">Pattern</span>
          <span class="text-muted-foreground">
            Select the lighting effect to apply.
          </span>
        </div>
        <Select.Root
          bind:value={
            () => String(rgbConfig!.currentEffect),
            (v) => updateConfig({ currentEffect: Number(v) })
          }
          type="single"
        >
          <Select.Trigger class="w-64" size="sm">
            {effects.find((e) => e.value === String(rgbConfig?.currentEffect))
              ?.label || "Unknown"}
          </Select.Trigger>
          <Select.Content class="w-[var(--bits-select-anchor-width)]">
            {#each effects as effect (effect.value)}
              <Select.Item value={effect.value}>{effect.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <!-- Brightness Slider -->
      <div class="flex flex-col gap-2">
        <div class="grid text-sm text-wrap">
          <span class="font-medium">
            Global Brightness: {Math.round(
              (rgbConfig.globalBrightness / 255) * 100,
            )}%
          </span>
        </div>
        <Slider
          type="single"
          bind:value={
            () => rgbConfig!.globalBrightness,
            (v) => updateConfig({ globalBrightness: v })
          }
          max={255}
          step={1}
        />
      </div>

      <!-- Speed Slider (shows for animated effects) -->
      {#if rgbConfig.currentEffect > 1}
        <div class="flex flex-col gap-2">
          <div class="grid text-sm text-wrap">
            <span class="font-medium">
              Effect Speed: {rgbConfig.effectSpeed}
            </span>
          </div>
          <Slider
            type="single"
            bind:value={
              () => rgbConfig!.effectSpeed,
              (v) => updateConfig({ effectSpeed: v })
            }
            max={255}
            step={1}
          />
        </div>
      {/if}

      <!-- Color Picker (shows for effects that use it) -->
      {#if rgbConfig.currentEffect !== 0}
        <div class="flex flex-col gap-2">
          <div class="grid text-sm text-wrap">
            <span class="font-semibold">
              {#if rgbConfig.currentEffect === 1}
                Solid Color
              {:else if rgbConfig.currentEffect === RGB_EFFECT_PER_KEY}
                Brush Color (Click key to paint)
              {:else if rgbConfig.currentEffect === RGB_EFFECT_ANALOG}
                Pressed Color
              {:else}
                Base Color
              {/if}
            </span>
          </div>

          {#if rgbConfig.currentEffect === RGB_EFFECT_PER_KEY}
            <div class="flex gap-2">
              <button
                class="flex-1 rounded-md border bg-secondary p-2 text-sm font-medium hover:bg-secondary/80"
                onclick={fillAll}>Fill All</button
              >
              <button
                class="flex-1 rounded-md border bg-secondary p-2 text-sm font-medium hover:bg-secondary/80"
                onclick={clearAll}>Clear All</button
              >
            </div>
          {/if}
          <div class="flex flex-col gap-3 rounded-md border p-4">
            <div class="grid grid-cols-[auto_1fr] items-center gap-4">
              <span class="w-4 text-sm font-medium text-red-500">R</span>
              <Slider
                type="single"
                bind:value={
                  () => rgbConfig!.solidColor.r, (v) => updateBrushColor("r", v)
                }
                max={255}
                step={1}
              />
            </div>
            <div class="grid grid-cols-[auto_1fr] items-center gap-4">
              <span class="w-4 text-sm font-medium text-green-500">G</span>
              <Slider
                type="single"
                bind:value={
                  () => rgbConfig!.solidColor.g, (v) => updateBrushColor("g", v)
                }
                max={255}
                step={1}
              />
            </div>
            <div class="grid grid-cols-[auto_1fr] items-center gap-4">
              <span class="w-4 text-sm font-medium text-blue-500">B</span>
              <Slider
                type="single"
                bind:value={
                  () => rgbConfig!.solidColor.b, (v) => updateBrushColor("b", v)
                }
                max={255}
                step={1}
              />
            </div>
            <div
              class="mt-1 h-8 w-full rounded-md border shadow-sm"
              style="background-color: rgb({rgbConfig.solidColor.r}, {rgbConfig
                .solidColor.g}, {rgbConfig.solidColor.b})"
            ></div>
          </div>
        </div>
      {/if}

      <!-- Secondary Color Picker (for dual-color effects) -->
      {#if [2, 16, 20, 48, 49, RGB_EFFECT_ANALOG].includes(rgbConfig.currentEffect)}
        <div class="flex flex-col gap-2">
          <div class="grid text-sm text-wrap">
            <span class="font-semibold"
              >{rgbConfig.currentEffect === 2
                ? "Alpha Color"
                : rgbConfig.currentEffect === RGB_EFFECT_ANALOG
                  ? "Base Color"
                  : "Secondary Color"}</span
            >
          </div>
          <div class="flex flex-col gap-3 rounded-md border p-4">
            <div class="grid grid-cols-[auto_1fr] items-center gap-4">
              <span class="w-4 text-sm font-medium text-red-500">R</span>
              <Slider
                type="single"
                bind:value={
                  () => rgbConfig!.secondaryColor.r,
                  (v) =>
                    updateConfig({
                      secondaryColor: { ...rgbConfig!.secondaryColor, r: v },
                    })
                }
                max={255}
                step={1}
              />
            </div>
            <div class="grid grid-cols-[auto_1fr] items-center gap-4">
              <span class="w-4 text-sm font-medium text-green-500">G</span>
              <Slider
                type="single"
                bind:value={
                  () => rgbConfig!.secondaryColor.g,
                  (v) =>
                    updateConfig({
                      secondaryColor: { ...rgbConfig!.secondaryColor, g: v },
                    })
                }
                max={255}
                step={1}
              />
            </div>
            <div class="grid grid-cols-[auto_1fr] items-center gap-4">
              <span class="w-4 text-sm font-medium text-blue-500">B</span>
              <Slider
                type="single"
                bind:value={
                  () => rgbConfig!.secondaryColor.b,
                  (v) =>
                    updateConfig({
                      secondaryColor: { ...rgbConfig!.secondaryColor, b: v },
                    })
                }
                max={255}
                step={1}
              />
            </div>
            <div
              class="mt-1 h-8 w-full rounded-md border shadow-sm"
              style="background-color: rgb({rgbConfig.secondaryColor
                .r}, {rgbConfig.secondaryColor.g}, {rgbConfig.secondaryColor
                .b})"
            ></div>
          </div>
        </div>
      {/if}
    {/if}
  </FixedScrollArea>
</div>
