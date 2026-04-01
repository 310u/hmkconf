<script lang="ts">
  import FixedScrollArea from "$lib/components/fixed-scroll-area.svelte"
  import { KeyButton } from "$lib/components/key-button"
  import { KeyboardEditorKeyboard } from "$lib/components/keyboard-editor"
  import { keyboardContext, type Keyboard } from "$lib/keyboard"
  import {
    HMK_RGB_BACKGROUND_COLOR_FIRMWARE_VERSION,
    type HMK_RgbColor,
    type HMK_RgbConfig,
  } from "$lib/libhmk/commands/rgb"
  import { cn, type WithoutChildren } from "$lib/utils"
  import type { HTMLAttributes } from "svelte/elements"
  import { globalStateContext } from "../context.svelte"
  import RgbBasicSettingsPanel from "./rgb-basic-settings-panel.svelte"
  import {
    RGB_EFFECT_ANALOG,
    RGB_EFFECT_BINARY_CLOCK,
    RGB_EFFECT_PER_KEY,
    RGB_EFFECT_TRIGGER_STATE,
    rgbEffectOptions,
    triggerStateEditors,
  } from "./rgb-constants"
  import RgbPrimaryColorPanel from "./rgb-primary-color-panel.svelte"
  import {
    buildDigitalRainColumns,
    buildRgbLedIndexByKey,
    clamp8,
    getRgbLedCoordsByIndex,
    getRgbLedCount,
    getRgbPreviewLedColor,
    qadd8,
    qsub8,
    randomDynamicColor,
    randomPixelColor,
    rgbToHue8,
    scale8,
  } from "./rgb-preview"
  import RgbSecondaryColorPanel from "./rgb-secondary-color-panel.svelte"
  import RgbTriggerStatePanel from "./rgb-trigger-state-panel.svelte"

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
    if (updated.currentEffect === RGB_EFFECT_BINARY_CLOCK) {
      await syncHostClock()
    }
  }

  async function syncHostClock() {
    if (
      tab !== "rgb" ||
      !rgbConfig ||
      rgbConfig.currentEffect !== RGB_EFFECT_BINARY_CLOCK
    ) {
      return
    }

    const now = new Date()
    try {
      await keyboard.setHostTime?.({
        hours: now.getHours(),
        minutes: now.getMinutes(),
        seconds: now.getSeconds(),
      })
    } catch (error) {
      console.warn("Failed to sync host clock", error)
    }
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
      const p = getRgbLedCoordsByIndex(metadata, ledIndex)
      for (let i = 0; i < next.length; i++) {
        if (i === ledIndex) continue
        const q = getRgbLedCoordsByIndex(metadata, i)
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

  function triggerStateColor(index: number) {
    return (
      rgbConfig?.triggerStateColors[index] ?? {
        r: 0,
        g: 0,
        b: 0,
      }
    )
  }

  function updateTriggerStateColor(
    index: number,
    channel: keyof HMK_RgbColor,
    value: number,
  ) {
    if (!rgbConfig) return
    const nextColors = rgbConfig.triggerStateColors.map((color) => ({
      ...color,
    }))
    nextColors[index] = { ...nextColors[index], [channel]: value }
    updateConfig({ triggerStateColors: nextColors })
  }

  const ledIndexByKey = $derived.by(() => {
    return buildRgbLedIndexByKey(metadata)
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
    return getRgbLedCount(metadata)
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

  function refreshDigitalRainColumns() {
    previewDigitalRainCols = buildDigitalRainColumns(metadata)
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
          refreshDigitalRainColumns()
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
                {
                  effect,
                  tick,
                  brightness: rgbConfig!.globalBrightness,
                  baseHue,
                  effectSpeed: rgbConfig!.effectSpeed,
                },
              ),
            )
          }

          const period = effect === 24 ? 10 : 5
          if (tick % period === 0 && tick !== lastRandomTick) {
            const index = Math.floor(Math.random() * ledCount())
            const c = randomDynamicColor(
              {
                effect,
                tick,
                brightness: rgbConfig.globalBrightness,
                baseHue,
                effectSpeed: rgbConfig.effectSpeed,
              },
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

  $effect(() => {
    if (
      tab !== "rgb" ||
      rgbConfig?.currentEffect !== RGB_EFFECT_BINARY_CLOCK
    ) {
      return
    }

    void syncHostClock()
    const interval = setInterval(() => {
      void syncHostClock()
    }, 30000)

    return () => clearInterval(interval)
  })

  function getLedColor(keyIndex: number) {
    return getRgbPreviewLedColor({
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
    })
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

      <RgbBasicSettingsPanel
        {rgbConfig}
        effectOptions={rgbEffectOptions}
        onUpdateConfig={updateConfig}
      />

      <RgbPrimaryColorPanel
        {rgbConfig}
        rgbEffectAnalog={RGB_EFFECT_ANALOG}
        rgbEffectPerKey={RGB_EFFECT_PER_KEY}
        rgbEffectTriggerState={RGB_EFFECT_TRIGGER_STATE}
        onFillAll={fillAll}
        onClearAll={clearAll}
        onUpdateBrushColor={updateBrushColor}
      />

      <RgbSecondaryColorPanel
        {rgbConfig}
        rgbEffectAnalog={RGB_EFFECT_ANALOG}
        rgbEffectBinaryClock={RGB_EFFECT_BINARY_CLOCK}
        supportsBackgroundColor={
          keyboard.version >= HMK_RGB_BACKGROUND_COLOR_FIRMWARE_VERSION
        }
        onUpdateConfig={updateConfig}
      />

      {#if rgbConfig.currentEffect === RGB_EFFECT_TRIGGER_STATE}
        <RgbTriggerStatePanel
          {triggerStateEditors}
          {triggerStateColor}
          onUpdateTriggerStateColor={updateTriggerStateColor}
        />
      {/if}
    {/if}
  </FixedScrollArea>
</div>
