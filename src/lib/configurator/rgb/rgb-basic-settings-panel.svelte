<script lang="ts">
  import Switch from "$lib/components/switch.svelte"
  import * as Select from "$lib/components/ui/select"
  import { Slider } from "$lib/components/ui/slider"
  import type { HMK_RgbConfig } from "$lib/libhmk/commands/rgb"

  type EffectOption = {
    value: string
    label: string
  }

  let {
    rgbConfig,
    effectOptions,
    onUpdateConfig,
  }: {
    rgbConfig: HMK_RgbConfig
    effectOptions: ReadonlyArray<EffectOption>
    onUpdateConfig: (newConfig: Partial<HMK_RgbConfig>) => void | Promise<void>
  } = $props()
</script>

<Switch
  bind:checked={
    () => rgbConfig.enabled === 1,
    (value) => onUpdateConfig({ enabled: value ? 1 : 0 })
  }
  id="rgb-enabled"
  title="Enable RGB Lighting"
  description="Turn all LEDs on or off."
/>

<div class="flex flex-col gap-2">
  <div class="grid text-sm text-wrap">
    <span class="font-semibold">Pattern</span>
    <span class="text-muted-foreground">
      Select the lighting effect to apply.
    </span>
  </div>
  <Select.Root
    bind:value={
      () => String(rgbConfig.currentEffect),
      (value) => onUpdateConfig({ currentEffect: Number(value) })
    }
    type="single"
  >
    <Select.Trigger class="w-64" size="sm">
      {effectOptions.find(
        (effect) => effect.value === String(rgbConfig.currentEffect),
      )?.label || "Unknown"}
    </Select.Trigger>
    <Select.Content class="w-[var(--bits-select-anchor-width)]">
      {#each effectOptions as effect (effect.value)}
        <Select.Item value={effect.value}>{effect.label}</Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>
</div>

<div class="flex flex-col gap-2">
  <div class="grid text-sm text-wrap">
    <span class="font-medium">
      Global Brightness: {Math.round((rgbConfig.globalBrightness / 255) * 100)}%
    </span>
  </div>
  <Slider
    type="single"
    bind:value={
      () => rgbConfig.globalBrightness,
      (value) => onUpdateConfig({ globalBrightness: value })
    }
    max={255}
    step={1}
  />
</div>

{#if rgbConfig.currentEffect > 1}
  <div class="flex flex-col gap-2">
    <div class="grid text-sm text-wrap">
      <span class="font-medium">Effect Speed: {rgbConfig.effectSpeed}</span>
    </div>
    <Slider
      type="single"
      bind:value={
        () => rgbConfig.effectSpeed,
        (value) => onUpdateConfig({ effectSpeed: value })
      }
      max={255}
      step={1}
    />
  </div>
{/if}
