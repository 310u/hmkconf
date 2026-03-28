<script lang="ts">
  import { Button } from "$lib/components/ui/button"
  import * as Select from "$lib/components/ui/select"
  import { Slider } from "$lib/components/ui/slider"
  import type {
    HMK_JoystickConfig,
    HMK_JoystickMousePreset,
  } from "$lib/libhmk/commands/joystick"

  type ModeOption = {
    value: string
    label: string
  }

  let {
    config,
    modes,
    supportsJoystickMousePresets,
    onModeChange,
    onSelectMousePreset,
    onUpdateActiveMousePreset,
    onDeadzoneChange,
    onDebounceChange,
  }: {
    config: HMK_JoystickConfig
    modes: ReadonlyArray<ModeOption>
    supportsJoystickMousePresets: boolean
    onModeChange: (mode: number) => void | Promise<void>
    onSelectMousePreset: (index: number) => void | Promise<void>
    onUpdateActiveMousePreset: (
      preset: Partial<HMK_JoystickMousePreset>,
    ) => void | Promise<void>
    onDeadzoneChange: (value: number) => void | Promise<void>
    onDebounceChange: (value: number) => void | Promise<void>
  } = $props()
</script>

<div class="flex flex-col gap-2">
  <div class="grid text-sm">
    <span class="font-semibold">Operation Mode</span>
    <span class="text-muted-foreground">
      Select how the joystick interacts with the host.
    </span>
  </div>
  <Select.Root
    bind:value={
      () => String(config.mode), (v) => onModeChange(Number(v))
    }
    type="single"
  >
    <Select.Trigger class="w-64" size="sm">
      {modes.find((entry) => entry.value === String(config.mode))?.label ||
        "Disabled"}
    </Select.Trigger>
    <Select.Content class="w-[var(--bits-select-anchor-width)]">
      {#each modes as mode (mode.value)}
        <Select.Item value={mode.value}>{mode.label}</Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>
</div>

{#if supportsJoystickMousePresets && (config.mode === 1 || config.mode === 4)}
  <div class="flex flex-col gap-3 rounded-xl border bg-card p-4">
    <div class="grid text-sm">
      <span class="font-medium">Mouse Preset {config.activeMousePreset + 1}</span>
      <span class="text-muted-foreground">
        Store four speed and acceleration pairs, then cycle them from the keymap
        with `Joy Preset Next`.
      </span>
    </div>
    <div class="flex flex-wrap gap-2">
      {#each config.mousePresets as preset, index (index)}
        <Button
          size="sm"
          variant={index === config.activeMousePreset ? "default" : "outline"}
          onclick={() => void onSelectMousePreset(index)}
        >
          P{index + 1}: {preset.mouseSpeed}/{preset.mouseAcceleration}
        </Button>
      {/each}
    </div>
  </div>
{/if}

{#if config.mode === 1 || config.mode === 4}
  <div class="flex flex-col gap-2">
    <div class="grid text-sm">
      <span class="font-medium">Mouse Speed: {config.mouseSpeed}</span>
      <span class="text-muted-foreground">Adjust how fast the cursor moves.</span>
    </div>
    <Slider
      type="single"
      bind:value={
        () => config.mouseSpeed,
        (v) => onUpdateActiveMousePreset({ mouseSpeed: v })
      }
      max={50}
      min={1}
      step={1}
    />
  </div>
{/if}

{#if config.mode === 1}
  <div class="flex flex-col gap-2">
    <div class="grid text-sm">
      <span class="font-medium">
        Mouse Acceleration: {config.mouseAcceleration}
      </span>
      <span class="text-muted-foreground">
        Lower values feel more linear. Higher values increase the speed boost
        near the edge.
      </span>
    </div>
    <Slider
      type="single"
      bind:value={
        () => config.mouseAcceleration,
        (v) => onUpdateActiveMousePreset({ mouseAcceleration: v })
      }
      max={255}
      min={1}
      step={1}
    />
  </div>
{/if}

<div class="flex flex-col gap-2">
  <div class="grid text-sm">
    <span class="font-medium">
      Deadzone: {Math.round((config.deadzone / 255) * 100)}%
    </span>
    <span class="text-muted-foreground">
      Inner area where input is ignored to prevent drift.
    </span>
  </div>
  <Slider
    type="single"
    bind:value={() => config.deadzone, (v) => onDeadzoneChange(v)}
    max={127}
    min={0}
    step={1}
  />
</div>

<div class="flex flex-col gap-2">
  <div class="grid text-sm">
    <span class="font-medium">Button Debounce: {config.swDebounceMs}ms</span>
    <span class="text-muted-foreground">
      Stabilization time for the push switch to prevent chattering.
    </span>
  </div>
  <Slider
    type="single"
    bind:value={() => config.swDebounceMs, (v) => onDebounceChange(v)}
    max={50}
    min={0}
    step={1}
  />
</div>
