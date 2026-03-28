<script lang="ts">
  import { Slider } from "$lib/components/ui/slider"
  import type { HMK_RgbColor } from "$lib/libhmk/commands/rgb"

  type TriggerStateEditor = {
    index: number
    key: string
    label: string
    description: string
  }

  let {
    triggerStateEditors,
    triggerStateColor,
    onUpdateTriggerStateColor,
  }: {
    triggerStateEditors: ReadonlyArray<TriggerStateEditor>
    triggerStateColor: (index: number) => HMK_RgbColor
    onUpdateTriggerStateColor: (
      index: number,
      channel: keyof HMK_RgbColor,
      value: number,
    ) => void | Promise<void>
  } = $props()
</script>

<div class="flex flex-col gap-3">
  <div class="grid text-sm">
    <span class="font-semibold">Trigger State Colors</span>
    <span class="text-muted-foreground">
      Set an individual RGB color for each trigger state preview.
    </span>
  </div>
  <div class="grid gap-4 lg:grid-cols-2">
    {#each triggerStateEditors as editor (editor.index)}
      <div class="flex flex-col gap-3 rounded-md border p-4">
        <div class="grid text-sm">
          <span class="font-semibold">{editor.label}</span>
          <span class="text-muted-foreground">{editor.description}</span>
        </div>
        <div class="grid grid-cols-[auto_1fr] items-center gap-4">
          <span class="w-4 text-sm font-medium text-red-500">R</span>
          <Slider
            type="single"
            bind:value={
              () => triggerStateColor(editor.index).r,
              (value) => onUpdateTriggerStateColor(editor.index, "r", value)
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
              () => triggerStateColor(editor.index).g,
              (value) => onUpdateTriggerStateColor(editor.index, "g", value)
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
              () => triggerStateColor(editor.index).b,
              (value) => onUpdateTriggerStateColor(editor.index, "b", value)
            }
            max={255}
            step={1}
          />
        </div>
        <div
          class="mt-1 h-8 w-full rounded-md border shadow-sm"
          style="background-color: rgb({triggerStateColor(editor.index).r}, {triggerStateColor(
            editor.index,
          ).g}, {triggerStateColor(editor.index).b})"
        ></div>
      </div>
    {/each}
  </div>
</div>
