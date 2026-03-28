<script lang="ts">
  import { Slider } from "$lib/components/ui/slider"
  import type { HMK_RgbConfig } from "$lib/libhmk/commands/rgb"

  let {
    rgbConfig,
    rgbEffectAnalog,
    rgbEffectPerKey,
    rgbEffectTriggerState,
    onFillAll,
    onClearAll,
    onUpdateBrushColor,
  }: {
    rgbConfig: HMK_RgbConfig
    rgbEffectAnalog: number
    rgbEffectPerKey: number
    rgbEffectTriggerState: number
    onFillAll: () => void
    onClearAll: () => void
    onUpdateBrushColor: (
      channel: "r" | "g" | "b",
      value: number,
    ) => void | Promise<void>
  } = $props()
</script>

{#if rgbConfig.currentEffect !== 0 &&
  rgbConfig.currentEffect !== rgbEffectTriggerState}
  <div class="flex flex-col gap-2">
    <div class="grid text-sm text-wrap">
      <span class="font-semibold">
        {#if rgbConfig.currentEffect === 1}
          Solid Color
        {:else if rgbConfig.currentEffect === rgbEffectPerKey}
          Brush Color (Click key to paint)
        {:else if rgbConfig.currentEffect === rgbEffectAnalog}
          Pressed Color
        {:else}
          Base Color
        {/if}
      </span>
    </div>

    {#if rgbConfig.currentEffect === rgbEffectPerKey}
      <div class="flex gap-2">
        <button
          class="flex-1 rounded-md border bg-secondary p-2 text-sm font-medium hover:bg-secondary/80"
          onclick={onFillAll}>Fill All</button
        >
        <button
          class="flex-1 rounded-md border bg-secondary p-2 text-sm font-medium hover:bg-secondary/80"
          onclick={onClearAll}>Clear All</button
        >
      </div>
    {/if}

    <div class="flex flex-col gap-3 rounded-md border p-4">
      <div class="grid grid-cols-[auto_1fr] items-center gap-4">
        <span class="w-4 text-sm font-medium text-red-500">R</span>
        <Slider
          type="single"
          bind:value={
            () => rgbConfig.solidColor.r,
            (value) => onUpdateBrushColor("r", value)
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
            () => rgbConfig.solidColor.g,
            (value) => onUpdateBrushColor("g", value)
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
            () => rgbConfig.solidColor.b,
            (value) => onUpdateBrushColor("b", value)
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
