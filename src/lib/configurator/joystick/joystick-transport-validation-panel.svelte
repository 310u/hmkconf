<script lang="ts">
  import { Button } from "$lib/components/ui/button"
  import type { HMK_JoystickState } from "$lib/libhmk/commands/joystick"
  import { cn } from "$lib/utils"
  import type { CircularityReport } from "./joystick-diagnostic-log"
  import JoystickDiagnosticPlot from "./joystick-diagnostic-plot.svelte"
  import type { JoystickVector } from "./joystick-diagnostics"
  import type { HostGamepadState } from "./joystick-host-gamepad"

  type CircularityToneFn = (score: number, sufficient: boolean) => string

  let {
    transportValidationAdvice,
    currentGamepadTransport,
    hostGamepadBackend,
    isLinuxHost,
    hostGamepadCircularity,
    liveLinuxHostInterpretation,
    livePredictedLinuxHostCircularity,
    gamepadHostValidationMode,
    hostGamepadStatus,
    hostGamepadPoints,
    hostCircularitySubtitle,
    hostGamepadState,
    joystickState,
    onResetLiveDiagnostics,
    onCopyDiagnosticLog,
    circularityTone,
  }: {
    transportValidationAdvice: string
    currentGamepadTransport: string
    hostGamepadBackend: string
    isLinuxHost: boolean
    hostGamepadCircularity: CircularityReport
    liveLinuxHostInterpretation: string
    livePredictedLinuxHostCircularity: CircularityReport
    gamepadHostValidationMode: string
    hostGamepadStatus: string
    hostGamepadPoints: JoystickVector[]
    hostCircularitySubtitle: string
    hostGamepadState: HostGamepadState
    joystickState: HMK_JoystickState | null
    onResetLiveDiagnostics: () => void
    onCopyDiagnosticLog: () => void | Promise<void>
    circularityTone: CircularityToneFn
  } = $props()
</script>

<div class="rounded-xl border bg-card p-4">
  <h3 class="mb-2 text-sm font-semibold">Transport Validation</h3>
  <div class="grid gap-2 text-sm text-muted-foreground">
    <span>
      These plots validate the shared firmware path first: raw ADC, per-axis
      calibration, circular correction, and radial deadzone.
    </span>
    <span>{transportValidationAdvice}</span>
  </div>
  <div
    class="mt-4 grid gap-2 rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground"
  >
    <span>
      Current gamepad transport:
      <span class="font-medium text-foreground">{currentGamepadTransport}</span>
    </span>
    <span>
      Host gamepad backend:
      <span class="font-medium text-foreground">{hostGamepadBackend}</span>
    </span>
    {#if isLinuxHost}
      {#if hostGamepadCircularity.sampleCount > 0}
        <span>
          Measured Linux browser host circularity:
          <span class="font-medium text-foreground">
            {Math.round(hostGamepadCircularity.score)}
          </span>
        </span>
      {:else}
        <span>
          Measured Linux browser host circularity:
          <span class="font-medium text-foreground">
            waiting for host samples
          </span>
        </span>
      {/if}
      <span>{liveLinuxHostInterpretation}</span>
      <span>
        Default Linux joydev reference from firmware OUT (reference only,
        ignores jscal overrides):
        <span class="font-medium text-foreground">
          {Math.round(livePredictedLinuxHostCircularity.score)}
        </span>
      </span>
    {/if}
    <span>{gamepadHostValidationMode}</span>
    <span>{hostGamepadStatus}</span>
  </div>
  <div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
    <JoystickDiagnosticPlot
      title="Host Gamepad Shape"
      subtitle="Reads the first connected gamepad from the host using the selected left or right stick."
      points={hostGamepadPoints}
      pointClass="fill-fuchsia-500/20"
      lastPointClass="fill-fuchsia-500 stroke-background stroke-2"
    />
    <div class="rounded-xl border bg-muted/20 p-4">
      <div class="mb-3 flex items-center justify-between gap-3">
        <div class="grid text-sm">
          <span class="font-medium">Host Circularity</span>
          <span class="text-muted-foreground">{hostCircularitySubtitle}</span>
        </div>
        <span
          class={cn(
            "rounded-full px-3 py-1 text-xs font-semibold",
            circularityTone(
              hostGamepadCircularity.score,
              hostGamepadCircularity.sufficient,
            ),
          )}
        >
          {hostGamepadCircularity.label}
        </span>
      </div>
      <div class="font-mono text-3xl font-semibold">
        {Math.round(hostGamepadCircularity.score)}
      </div>
      <div
        class="mt-3 grid grid-cols-2 gap-2 font-mono text-xs text-muted-foreground"
      >
        <div>Outer Samples: {hostGamepadCircularity.outerSampleCount}</div>
        <div>Quadrants: {hostGamepadCircularity.quadrantCoverage}/4</div>
        <div>
          Axis Ratio: {Math.round(hostGamepadCircularity.axisRatio * 100)}%
        </div>
        <div>
          Radius Spread: {Math.round(
            hostGamepadCircularity.radiusSpread * 100,
          )}%
        </div>
      </div>
      {#if hostGamepadState.connected}
        <div class="mt-3 text-xs text-muted-foreground">
          Gamepad #{hostGamepadState.index}: {hostGamepadState.id}
        </div>
      {/if}
    </div>
  </div>
  <div
    class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
  >
    <p class="text-sm text-muted-foreground">
      Copy a structured log after calibration and paste it into chat for remote
      diagnosis.
    </p>
    <div class="flex flex-col gap-2 sm:flex-row">
      <Button
        variant="outline"
        size="sm"
        onclick={onResetLiveDiagnostics}
        disabled={!joystickState}
      >
        Reset Live Diagnostics
      </Button>
      <Button
        variant="outline"
        size="sm"
        onclick={onCopyDiagnosticLog}
        disabled={!joystickState}
      >
        Copy Diagnostic Log
      </Button>
    </div>
  </div>
</div>
