<script lang="ts">
  import { Button } from "$lib/components/ui/button"
  import { Label } from "$lib/components/ui/label"
  import * as Select from "$lib/components/ui/select"
  import { Slider } from "$lib/components/ui/slider"
  import { keyboardContext, type Keyboard } from "$lib/keyboard"
  import type {
    HMK_JoystickConfig,
    HMK_JoystickState,
  } from "$lib/libhmk/commands/joystick"
  import { cn, type WithoutChildren } from "$lib/utils"
  import type { HTMLAttributes } from "svelte/elements"
  import { globalStateContext } from "../context.svelte"

  const JOYSTICK_STATE_POLL_INTERVAL = 1000 / 30

  const {
    class: className,
    ...props
  }: WithoutChildren<HTMLAttributes<HTMLDivElement>> = $props()

  const keyboard = keyboardContext.get() as Keyboard
  const { profile, tab } = $derived(globalStateContext.get())

  let config = $state<HMK_JoystickConfig | null>(null)
  let joystickState = $state<HMK_JoystickState | null>(null)
  let loading = $state(true)

  let calibrationPhase = $state<"idle" | "rest" | "max">("idle")
  let calibrationPreviousMode = $state<number | null>(null)

  $effect(() => {
    if (tab !== "joystick") return

    loading = true
    let active = true
    let pollTimeout: number | null = null

    keyboard.getJoystickConfig?.({ profile })
      .then((c) => {
        if (!active) return
        config = c
      })
      .catch(() => {
        // ignore disconnects
      })
      .finally(() => {
        if (active) loading = false
      })

    async function pollState() {
      if (!active) return
      try {
        if (keyboard.getJoystickState) {
          joystickState = await keyboard.getJoystickState()
        }
      } catch (e) {
        // ignore disconnects
      }
      if (active) {
        pollTimeout = window.setTimeout(
          pollState,
          JOYSTICK_STATE_POLL_INTERVAL,
        )
      }
    }
    pollState()

    return () => {
      active = false
      if (pollTimeout !== null) {
        clearTimeout(pollTimeout)
      }
    }
  })

  async function updateConfig(newConfig: Partial<HMK_JoystickConfig>) {
    if (!config) return
    const updated = { ...config, ...newConfig }
    config = updated
    await keyboard.setJoystickConfig?.({ profile, config: updated })
  }

  const modes = [
    { value: "0", label: "Disabled" },
    { value: "1", label: "Mouse" },
    { value: "2", label: "XInput Left Stick" },
    { value: "3", label: "XInput Right Stick" },
    { value: "4", label: "Scroll" },
  ]

  // Calibration logic
  // We collect samples to find min/max and center
  let centerSamplesX: number[] = []
  let centerSamplesY: number[] = []
  let minX = 4095
  let maxX = 0
  let minY = 4095
  let maxY = 0

  $effect(() => {
    if (!joystickState) return

    if (calibrationPhase === "rest") {
      centerSamplesX.push(joystickState.rawX)
      centerSamplesY.push(joystickState.rawY)
    } else if (calibrationPhase === "max") {
      minX = Math.min(minX, joystickState.rawX)
      maxX = Math.max(maxX, joystickState.rawX)
      minY = Math.min(minY, joystickState.rawY)
      maxY = Math.max(maxY, joystickState.rawY)
    }
  })

  async function startCalibration() {
    if (!config) return

    centerSamplesX = []
    centerSamplesY = []
    minX = 4095
    maxX = 0
    minY = 4095
    maxY = 0

    calibrationPreviousMode = config.mode
    if (config.mode !== 0) {
      await updateConfig({ mode: 0 })
    }

    calibrationPhase = "rest"
  }

  function nextCalibrationStep() {
    if (calibrationPhase === "rest") {
      calibrationPhase = "max"
    } else if (calibrationPhase === "max") {
      finishCalibration()
    }
  }

  async function cancelCalibration() {
    calibrationPhase = "idle"
    if (calibrationPreviousMode !== null && config) {
      const restoreMode = calibrationPreviousMode
      calibrationPreviousMode = null
      if (config.mode !== restoreMode) {
        await updateConfig({ mode: restoreMode })
      }
    }
  }

  async function finishCalibration() {
    if (!config) return

    const avgCx =
      centerSamplesX.reduce((a, b) => a + b, 0) /
      Math.max(1, centerSamplesX.length)
    const avgCy =
      centerSamplesY.reduce((a, b) => a + b, 0) /
      Math.max(1, centerSamplesY.length)

    const updated = { ...config }
    updated.x.center = Math.round(avgCx)
    updated.y.center = Math.round(avgCy)

    // Safety boundaries
    updated.x.min = Math.min(minX, updated.x.center - 100)
    updated.x.max = Math.max(maxX, updated.x.center + 100)
    updated.y.min = Math.min(minY, updated.y.center - 100)
    updated.y.max = Math.max(maxY, updated.y.center + 100)
    if (calibrationPreviousMode !== null) {
      updated.mode = calibrationPreviousMode
    }

    calibrationPhase = "idle"
    calibrationPreviousMode = null

    config = updated
    await keyboard.setJoystickConfig?.({ profile, config: updated })
  }
</script>

<div
  class={cn(
    "mx-auto flex size-full max-w-3xl flex-col gap-6 overflow-y-auto p-4",
    className,
  )}
  {...props}
>
  {#if loading || !config}
    <p class="text-muted-foreground">Loading Joystick configuration...</p>
  {:else}
    <div class="flex flex-col gap-2">
      <div class="grid text-sm">
        <span class="font-semibold">Operation Mode</span>
        <span class="text-muted-foreground"
          >Select how the joystick interacts with the host.</span
        >
      </div>
      <Select.Root
        bind:value={
          () => String(config!.mode), (v) => updateConfig({ mode: Number(v) })
        }
        type="single"
      >
        <Select.Trigger class="w-64" size="sm">
          {modes.find((e) => e.value === String(config?.mode))?.label ||
            "Disabled"}
        </Select.Trigger>
        <Select.Content class="w-[var(--bits-select-anchor-width)]">
          {#each modes as m (m.value)}
            <Select.Item value={m.value}>{m.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    <!-- Mode Specific Settings -->
    {#if config.mode === 1 || config.mode === 4}
      <div class="flex flex-col gap-2">
        <div class="grid text-sm">
          <span class="font-medium">Mouse Speed: {config.mouseSpeed}</span>
          <span class="text-muted-foreground"
            >Adjust how fast the cursor moves.</span
          >
        </div>
        <Slider
          type="single"
          bind:value={
            () => config!.mouseSpeed, (v) => updateConfig({ mouseSpeed: v })
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
          <span class="font-medium"
            >Mouse Acceleration: {config.mouseAcceleration}</span
          >
          <span class="text-muted-foreground"
            >Lower values feel more linear. Higher values increase the speed
            boost near the edge.</span
          >
        </div>
        <Slider
          type="single"
          bind:value={
            () => config!.mouseAcceleration,
            (v) => updateConfig({ mouseAcceleration: v })
          }
          max={255}
          min={1}
          step={1}
        />
      </div>
    {/if}

    <div class="flex flex-col gap-2">
      <div class="grid text-sm">
        <span class="font-medium"
          >Deadzone: {Math.round((config.deadzone / 255) * 100)}%</span
        >
        <span class="text-muted-foreground"
          >Inner area where input is ignored to prevent drift.</span
        >
      </div>
      <Slider
        type="single"
        bind:value={
          () => config!.deadzone, (v) => updateConfig({ deadzone: v })
        }
        max={127}
        min={0}
        step={1}
      />
    </div>

    <div class="flex flex-col gap-2">
      <div class="grid text-sm">
        <span class="font-medium">Button Debounce: {config.swDebounceMs}ms</span
        >
        <span class="text-muted-foreground"
          >Stabilization time for the push switch to prevent chattering.</span
        >
      </div>
      <Slider
        type="single"
        bind:value={
          () => config!.swDebounceMs, (v) => updateConfig({ swDebounceMs: v })
        }
        max={50}
        min={0}
        step={1}
      />
    </div>

    <!-- State Monitor -->
    <div class="mt-4 rounded-xl border bg-card p-4">
      <h3 class="mb-4 text-sm font-semibold">Live Monitor</h3>
      <div class="grid grid-cols-2 gap-4 font-mono text-xs">
        <div>
          RAW X: {joystickState?.rawX ?? 0}<br />
          RAW Y: {joystickState?.rawY ?? 0}<br />
        </div>
        <div>
          OUT X: {joystickState?.outX ?? 0}<br />
          OUT Y: {joystickState?.outY ?? 0}<br />
          BTN: {joystickState?.sw ? "PRESSED" : "RELEASED"}
        </div>
      </div>
    </div>

    <!-- Calibration Wizard -->
    <div class="mt-4 rounded-xl border bg-card p-4">
      <h3 class="mb-2 text-lg font-semibold">Calibration</h3>

      {#if calibrationPhase === "idle"}
        <p class="mb-4 text-sm text-muted-foreground">
          Click below to calibrate the joystick's resting center and maximum
          ranges. Mouse/scroll output is temporarily disabled during
          calibration.
        </p>
        <Button onclick={startCalibration}>Start Calibration</Button>
        <div
          class="mt-4 grid grid-cols-2 gap-2 font-mono text-xs text-muted-foreground"
        >
          <div>
            X Min: {config.x.min}<br />
            X Ctr: {config.x.center}<br />
            X Max: {config.x.max}<br />
          </div>
          <div>
            Y Min: {config.y.min}<br />
            Y Ctr: {config.y.center}<br />
            Y Max: {config.y.max}<br />
          </div>
        </div>
      {:else}
        <div class="mb-4 rounded-lg bg-primary/10 p-4">
          {#if calibrationPhase === "rest"}
            <p class="font-medium text-foreground">
              Step 1: Release the joystick.
            </p>
            <p class="mt-1 text-sm text-muted-foreground">
              Do not touch the joystick so its natural center point can be
              recorded.
            </p>
          {:else if calibrationPhase === "max"}
            <p class="font-medium text-foreground">
              Step 2: Move the joystick in all directions.
            </p>
            <p class="mt-1 text-sm text-muted-foreground">
              Roll it slowly around the outer edge a few times to record the
              maximum range.
            </p>
          {/if}
        </div>

        <div class="flex gap-2">
          <Button variant="outline" onclick={cancelCalibration}>Cancel</Button>
          <Button onclick={nextCalibrationStep}>
            {calibrationPhase === "max" ? "Finish" : "Next"}
          </Button>
        </div>
      {/if}
    </div>
  {/if}
</div>
