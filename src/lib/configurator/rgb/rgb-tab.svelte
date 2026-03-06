<script lang="ts">
  import FixedScrollArea from "$lib/components/fixed-scroll-area.svelte"
  import { KeyButton } from "$lib/components/key-button"
  import { KeyboardEditorKeyboard } from "$lib/components/keyboard-editor"
  import Switch from "$lib/components/switch.svelte"
  import { Label } from "$lib/components/ui/label"
  import * as Select from "$lib/components/ui/select"
  import { Slider } from "$lib/components/ui/slider"
  import { keyboardContext, type Keyboard } from "$lib/keyboard"
  import type { HMK_RgbConfig } from "$lib/libhmk/commands/rgb"
  import { cn, type WithoutChildren } from "$lib/utils"
  import type { HTMLAttributes } from "svelte/elements"
  import { globalStateContext } from "../context.svelte"

  const {
    class: className,
    ...props
  }: WithoutChildren<HTMLAttributes<HTMLDivElement>> = $props()

  const keyboard = keyboardContext.get() as Keyboard
  const { profile } = $derived(globalStateContext.get())

  let rgbConfig = $state<HMK_RgbConfig | null>(null)
  let loading = $state(true)

  $effect(() => {
    loading = true
    keyboard.getRgbConfig?.({ profile }).then((config) => {
      rgbConfig = config
      loading = false
    })
  })

  async function updateConfig(newConfig: Partial<HMK_RgbConfig>) {
    if (!rgbConfig) return
    const updated = { ...rgbConfig, ...newConfig }
    rgbConfig = updated
    await keyboard.setRgbConfig?.({ profile, data: updated })
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
    { value: "13", label: "Rainbow Swirl" },
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
  ]
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
        style={rgbConfig.enabled && rgbConfig.currentEffect === 1
          ? `--kbd-bg: rgb(${rgbConfig.solidColor.r}, ${rgbConfig.solidColor.g}, ${rgbConfig.solidColor.b})`
          : ""}
      >
        {#if rgbConfig.enabled && rgbConfig.currentEffect > 1}
          <div
            class="absolute inset-0 animate-pulse bg-gradient-to-r from-red-500 via-green-500 to-blue-500 opacity-20"
          ></div>
        {/if}
        <KeyboardEditorKeyboard class="relative z-10 size-full">
          {#snippet keyGenerator(key, isJoystick)}
            <KeyButton
              class={cn(
                "transition-colors duration-300",
                isJoystick ? "rounded-full" : "",
                rgbConfig?.enabled
                  ? rgbConfig.currentEffect === 1
                    ? "bg-[var(--kbd-bg,hsl(var(--muted)))]"
                    : "bg-primary/40"
                  : "bg-muted opacity-50",
              )}
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

      <!-- Solid Color Picker (shows for Solid Color effect) -->
      {#if rgbConfig.currentEffect === 1}
        <div class="flex flex-col gap-2">
          <div class="grid text-sm text-wrap">
            <span class="font-semibold">Solid Color</span>
          </div>
          <div class="flex flex-col gap-3 rounded-md border p-4">
            <div class="grid grid-cols-[auto_1fr] items-center gap-4">
              <span class="w-4 text-sm font-medium text-red-500">R</span>
              <Slider
                type="single"
                bind:value={
                  () => rgbConfig!.solidColor.r,
                  (v) =>
                    updateConfig({
                      solidColor: { ...rgbConfig!.solidColor, r: v },
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
                  () => rgbConfig!.solidColor.g,
                  (v) =>
                    updateConfig({
                      solidColor: { ...rgbConfig!.solidColor, g: v },
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
                  () => rgbConfig!.solidColor.b,
                  (v) =>
                    updateConfig({
                      solidColor: { ...rgbConfig!.solidColor, b: v },
                    })
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
    {/if}
  </FixedScrollArea>
</div>
