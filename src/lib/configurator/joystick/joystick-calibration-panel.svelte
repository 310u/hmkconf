<script lang="ts">
  import { Button } from "$lib/components/ui/button"
  import type { HMK_JoystickConfig } from "$lib/libhmk/commands/joystick"

  let {
    calibrationPhase,
    numProfiles,
    config,
    onStart,
    onCancel,
    onNext,
  }: {
    calibrationPhase: "idle" | "rest" | "max"
    numProfiles: number
    config: HMK_JoystickConfig
    onStart: () => void | Promise<void>
    onCancel: () => void | Promise<void>
    onNext: () => void
  } = $props()
</script>

<div class="mt-4 rounded-xl border bg-card p-4">
  <h3 class="mb-2 text-lg font-semibold">Calibration</h3>

  {#if calibrationPhase === "idle"}
    <p class="mb-4 text-sm text-muted-foreground">
      Click below to calibrate the joystick's resting center and maximum
      ranges. Mouse/scroll output is temporarily disabled during calibration.
      {#if numProfiles > 1}
        The measured center, travel range, and boundary map are shared across
        all profiles, while profile-specific behavior like mode and deadzone
        stays as-is.
      {/if}
    </p>
    <Button onclick={onStart}>Start Calibration</Button>
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
          maximum range. Aim to cover all four quadrants while keeping the
          Sweep Circularity card as high as possible.
        </p>
      {/if}
    </div>

    <div class="flex gap-2">
      <Button variant="outline" onclick={onCancel}>Cancel</Button>
      <Button onclick={onNext}>
        {calibrationPhase === "max" ? "Finish" : "Next"}
      </Button>
    </div>
  {/if}
</div>
