<script lang="ts">
  import { Slider } from "$lib/components/ui/slider"
  import type { HMK_RgbConfig } from "$lib/libhmk/commands/rgb"

  let {
    rgbConfig,
    rgbEffectAnalog,
    rgbEffectBinaryClock,
    supportsBackgroundColor,
    onUpdateConfig,
  }: {
    rgbConfig: HMK_RgbConfig
    rgbEffectAnalog: number
    rgbEffectBinaryClock: number
    supportsBackgroundColor: boolean
    onUpdateConfig: (newConfig: Partial<HMK_RgbConfig>) => void | Promise<void>
  } = $props()
</script>

{#if [2, 16, 20, 48, 49, rgbEffectAnalog, rgbEffectBinaryClock].includes(
  rgbConfig.currentEffect,
)}
  <div class="flex flex-col gap-2">
    <div class="grid text-sm text-wrap">
      <span class="font-semibold"
        >{rgbConfig.currentEffect === 2
          ? "Alpha Color"
          : rgbConfig.currentEffect === rgbEffectAnalog
            ? "Base Color"
            : rgbConfig.currentEffect === rgbEffectBinaryClock
              ? "Seconds / Grid Color"
            : "Secondary Color"}</span
      >
    </div>
    <div class="flex flex-col gap-3 rounded-md border p-4">
      <div class="grid grid-cols-[auto_1fr] items-center gap-4">
        <span class="w-4 text-sm font-medium text-red-500">R</span>
        <Slider
          type="single"
          bind:value={
            () => rgbConfig.secondaryColor.r,
            (value) =>
              onUpdateConfig({
                secondaryColor: { ...rgbConfig.secondaryColor, r: value },
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
            () => rgbConfig.secondaryColor.g,
            (value) =>
              onUpdateConfig({
                secondaryColor: { ...rgbConfig.secondaryColor, g: value },
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
            () => rgbConfig.secondaryColor.b,
            (value) =>
              onUpdateConfig({
                secondaryColor: { ...rgbConfig.secondaryColor, b: value },
              })
          }
          max={255}
          step={1}
        />
      </div>
      <div
        class="mt-1 h-8 w-full rounded-md border shadow-sm"
        style="background-color: rgb({rgbConfig.secondaryColor.r}, {rgbConfig
          .secondaryColor.g}, {rgbConfig.secondaryColor.b})"
      ></div>
    </div>

    {#if supportsBackgroundColor &&
      rgbConfig.currentEffect === rgbEffectBinaryClock}
      <div class="grid text-sm text-wrap">
        <span class="font-semibold">Background Color</span>
      </div>
      <div class="flex flex-col gap-3 rounded-md border p-4">
        <div class="grid grid-cols-[auto_1fr] items-center gap-4">
          <span class="w-4 text-sm font-medium text-red-500">R</span>
          <Slider
            type="single"
            bind:value={
              () => (rgbConfig.backgroundColor ?? rgbConfig.secondaryColor).r,
              (value) =>
                onUpdateConfig({
                  backgroundColor: {
                    ...(rgbConfig.backgroundColor ?? rgbConfig.secondaryColor),
                    r: value,
                  },
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
              () => (rgbConfig.backgroundColor ?? rgbConfig.secondaryColor).g,
              (value) =>
                onUpdateConfig({
                  backgroundColor: {
                    ...(rgbConfig.backgroundColor ?? rgbConfig.secondaryColor),
                    g: value,
                  },
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
              () => (rgbConfig.backgroundColor ?? rgbConfig.secondaryColor).b,
              (value) =>
                onUpdateConfig({
                  backgroundColor: {
                    ...(rgbConfig.backgroundColor ?? rgbConfig.secondaryColor),
                    b: value,
                  },
                })
            }
            max={255}
            step={1}
          />
        </div>
        <div
          class="mt-1 h-8 w-full rounded-md border shadow-sm"
          style="background-color: rgb({(rgbConfig.backgroundColor ??
            rgbConfig.secondaryColor).r}, {(rgbConfig.backgroundColor ??
            rgbConfig.secondaryColor).g}, {(rgbConfig.backgroundColor ??
            rgbConfig.secondaryColor).b})"
        ></div>
      </div>
    {/if}
  </div>
{/if}
