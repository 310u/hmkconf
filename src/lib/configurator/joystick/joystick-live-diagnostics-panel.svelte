<script lang="ts">
  import { Button } from "$lib/components/ui/button"
  import type { HMK_JoystickState } from "$lib/libhmk/commands/joystick"
  import type { CircularityReport } from "./joystick-diagnostic-log"
  import JoystickDiagnosticPlot from "./joystick-diagnostic-plot.svelte"
  import type { JoystickVector } from "./joystick-diagnostics"

  type CircularityToneFn = (score: number, sufficient: boolean) => string

  let {
    profile,
    joystickState,
    currentReferenceOut,
    liveRawPoints,
    liveOutPoints,
    liveReferenceOutPoints,
    liveRawCircularity,
    liveOutCircularity,
    liveReferenceOutCircularity,
    sweepCircularity,
    freshCapturePhase,
    freshCaptureStatus,
    freshRawCircularity,
    freshOutCircularity,
    freshHostCircularity,
    freshLiveSampleCount,
    freshHostSampleCount,
    freshHostSubtitle,
    calibrationPhase,
    displayedSweepPoints,
    onStartFreshCapture,
    onCancelFreshCapture,
    onStopFreshCapture,
    circularityTone,
  }: {
    profile: number
    joystickState: HMK_JoystickState | null
    currentReferenceOut: JoystickVector | null
    liveRawPoints: JoystickVector[]
    liveOutPoints: JoystickVector[]
    liveReferenceOutPoints: JoystickVector[]
    liveRawCircularity: CircularityReport
    liveOutCircularity: CircularityReport
    liveReferenceOutCircularity: CircularityReport
    sweepCircularity: CircularityReport
    freshCapturePhase: "idle" | "armed" | "capturing" | "complete"
    freshCaptureStatus: string
    freshRawCircularity: CircularityReport
    freshOutCircularity: CircularityReport
    freshHostCircularity: CircularityReport
    freshLiveSampleCount: number
    freshHostSampleCount: number
    freshHostSubtitle: string
    calibrationPhase: "idle" | "rest" | "max"
    displayedSweepPoints: JoystickVector[]
    onStartFreshCapture: () => void
    onCancelFreshCapture: () => void
    onStopFreshCapture: () => void
    circularityTone: CircularityToneFn
  } = $props()
</script>

<div class="mt-4 rounded-xl border bg-card p-4">
  <h3 class="mb-4 text-sm font-semibold">Live Monitor</h3>
  <div class="grid grid-cols-2 gap-4 font-mono text-xs">
    <div>
      STATE PROFILE: {joystickState?.profile ?? 0}<br />
      RAW X: {joystickState?.rawX ?? 0}<br />
      RAW Y: {joystickState?.rawY ?? 0}<br />
    </div>
    <div>
      OUT X: {joystickState?.outX ?? 0}<br />
      OUT Y: {joystickState?.outY ?? 0}<br />
      CAL X: {joystickState?.calibratedX ?? 0}<br />
      CAL Y: {joystickState?.calibratedY ?? 0}<br />
      CORR X: {joystickState?.correctedX ?? 0}<br />
      CORR Y: {joystickState?.correctedY ?? 0}<br />
      REF X: {currentReferenceOut?.x ?? 0}<br />
      REF Y: {currentReferenceOut?.y ?? 0}<br />
      BTN: {joystickState?.sw ? "PRESSED" : "RELEASED"}
    </div>
  </div>
  {#if joystickState && joystickState.profile !== profile}
    <p class="mt-3 text-xs text-amber-600">
      The device is currently running profile {joystickState.profile}, but this
      tab is showing config for profile {profile}. Diagnostics below use the
      runtime profile config when available, but edits still apply to profile
      {profile}.
    </p>
  {/if}
</div>

<div class="grid gap-4 lg:grid-cols-3">
  <JoystickDiagnosticPlot
    title="Normalized RAW Shape"
    subtitle="ADC samples normalized with the current joystick calibration."
    points={liveRawPoints}
    pointClass="fill-amber-500/20"
    lastPointClass="fill-amber-500 stroke-background stroke-2"
  />
  <JoystickDiagnosticPlot
    title="Firmware OUT Shape"
    subtitle="The common firmware output after calibration and radial deadzone."
    points={liveOutPoints}
    pointClass="fill-emerald-500/20"
    lastPointClass="fill-emerald-500 stroke-background stroke-2"
  />
  <JoystickDiagnosticPlot
    title="Reference OUT Shape"
    subtitle="What the host-side reference implementation predicts from RAW plus the current config."
    points={liveReferenceOutPoints}
    pointClass="fill-cyan-500/20"
    lastPointClass="fill-cyan-500 stroke-background stroke-2"
  />
</div>

<div class="grid gap-4 lg:grid-cols-4">
  <div class="rounded-xl border bg-card p-4">
    <div class="mb-3 flex items-center justify-between gap-3">
      <div class="grid text-sm">
        <span class="font-medium">RAW Circularity</span>
        <span class="text-muted-foreground">
          Checks the common input path before transport-specific reporting.
        </span>
      </div>
      <span
        class={`rounded-full px-3 py-1 text-xs font-semibold ${circularityTone(
          liveRawCircularity.score,
          liveRawCircularity.sufficient,
        )}`}
      >
        {liveRawCircularity.label}
      </span>
    </div>
    <div class="font-mono text-3xl font-semibold">
      {Math.round(liveRawCircularity.score)}
    </div>
    <div
      class="mt-3 grid grid-cols-2 gap-2 font-mono text-xs text-muted-foreground"
    >
      <div>Outer Samples: {liveRawCircularity.outerSampleCount}</div>
      <div>Quadrants: {liveRawCircularity.quadrantCoverage}/4</div>
      <div>Axis Ratio: {Math.round(liveRawCircularity.axisRatio * 100)}%</div>
      <div>
        Radius Spread: {Math.round(liveRawCircularity.radiusSpread * 100)}%
      </div>
    </div>
  </div>

  <div class="rounded-xl border bg-card p-4">
    <div class="mb-3 flex items-center justify-between gap-3">
      <div class="grid text-sm">
        <span class="font-medium">OUT Circularity</span>
        <span class="text-muted-foreground">
          Captures what the shared firmware path hands to mouse or gamepad
          logic.
        </span>
      </div>
      <span
        class={`rounded-full px-3 py-1 text-xs font-semibold ${circularityTone(
          liveOutCircularity.score,
          liveOutCircularity.sufficient,
        )}`}
      >
        {liveOutCircularity.label}
      </span>
    </div>
    <div class="font-mono text-3xl font-semibold">
      {Math.round(liveOutCircularity.score)}
    </div>
    <div
      class="mt-3 grid grid-cols-2 gap-2 font-mono text-xs text-muted-foreground"
    >
      <div>Outer Samples: {liveOutCircularity.outerSampleCount}</div>
      <div>Quadrants: {liveOutCircularity.quadrantCoverage}/4</div>
      <div>Axis Ratio: {Math.round(liveOutCircularity.axisRatio * 100)}%</div>
      <div>
        Radius Spread: {Math.round(liveOutCircularity.radiusSpread * 100)}%
      </div>
    </div>
  </div>

  <div class="rounded-xl border bg-card p-4">
    <div class="mb-3 flex items-center justify-between gap-3">
      <div class="grid text-sm">
        <span class="font-medium">Reference OUT Circularity</span>
        <span class="text-muted-foreground">
          Host-side prediction from RAW, circular correction, and radial
          deadzone.
        </span>
      </div>
      <span
        class={`rounded-full px-3 py-1 text-xs font-semibold ${circularityTone(
          liveReferenceOutCircularity.score,
          liveReferenceOutCircularity.sufficient,
        )}`}
      >
        {liveReferenceOutCircularity.label}
      </span>
    </div>
    <div class="font-mono text-3xl font-semibold">
      {Math.round(liveReferenceOutCircularity.score)}
    </div>
    <div
      class="mt-3 grid grid-cols-2 gap-2 font-mono text-xs text-muted-foreground"
    >
      <div>Outer Samples: {liveReferenceOutCircularity.outerSampleCount}</div>
      <div>Quadrants: {liveReferenceOutCircularity.quadrantCoverage}/4</div>
      <div>
        Axis Ratio: {Math.round(liveReferenceOutCircularity.axisRatio * 100)}%
      </div>
      <div>
        Radius Spread: {Math.round(
          liveReferenceOutCircularity.radiusSpread * 100,
        )}%
      </div>
    </div>
  </div>

  <div class="rounded-xl border bg-card p-4">
    <div class="mb-3 flex items-center justify-between gap-3">
      <div class="grid text-sm">
        <span class="font-medium">Sweep Circularity</span>
        <span class="text-muted-foreground">
          Uses the calibration sweep to estimate the next X/Y min-center-max and
          angle-based boundary map.
        </span>
      </div>
      <span
        class={`rounded-full px-3 py-1 text-xs font-semibold ${circularityTone(
          sweepCircularity.score,
          sweepCircularity.sufficient,
        )}`}
      >
        {sweepCircularity.label}
      </span>
    </div>
    <div class="font-mono text-3xl font-semibold">
      {Math.round(sweepCircularity.score)}
    </div>
    <div
      class="mt-3 grid grid-cols-2 gap-2 font-mono text-xs text-muted-foreground"
    >
      <div>Outer Samples: {sweepCircularity.outerSampleCount}</div>
      <div>Quadrants: {sweepCircularity.quadrantCoverage}/4</div>
      <div>Axis Ratio: {Math.round(sweepCircularity.axisRatio * 100)}%</div>
      <div>Radius Spread: {Math.round(sweepCircularity.radiusSpread * 100)}%</div>
    </div>
  </div>
</div>

<div class="rounded-xl border bg-card p-4">
  <div
    class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
  >
    <div class="grid text-sm">
      <span class="font-medium">Fresh Capture</span>
      <span class="text-muted-foreground">{freshCaptureStatus}</span>
    </div>
    <div class="flex flex-col gap-2 sm:flex-row">
      {#if freshCapturePhase === "capturing"}
        <Button
          variant="outline"
          size="sm"
          onclick={onStopFreshCapture}
          disabled={!joystickState}
        >
          Stop Fresh Capture
        </Button>
      {:else if freshCapturePhase === "armed"}
        <Button
          variant="outline"
          size="sm"
          onclick={onCancelFreshCapture}
          disabled={!joystickState}
        >
          Cancel Fresh Capture
        </Button>
      {:else}
        <Button
          variant="outline"
          size="sm"
          onclick={onStartFreshCapture}
          disabled={!joystickState || calibrationPhase !== "idle"}
        >
          Start Fresh Capture
        </Button>
      {/if}
    </div>
  </div>
  <div class="mt-4 grid gap-4 lg:grid-cols-3">
    <div class="rounded-xl border bg-muted/20 p-4">
      <div class="grid text-sm">
        <span class="font-medium">Fresh RAW</span>
        <span class="text-muted-foreground">
          Fixed-window capture from motion start to sweep end.
        </span>
      </div>
      <div class="mt-3 font-mono text-3xl font-semibold">
        {Math.round(freshRawCircularity.score)}
      </div>
      <div class="mt-3 font-mono text-xs text-muted-foreground">
        Samples: {freshLiveSampleCount}
      </div>
    </div>
    <div class="rounded-xl border bg-muted/20 p-4">
      <div class="grid text-sm">
        <span class="font-medium">Fresh OUT</span>
        <span class="text-muted-foreground">
          This is the stable number to compare across sweeps.
        </span>
      </div>
      <div class="mt-3 font-mono text-3xl font-semibold">
        {Math.round(freshOutCircularity.score)}
      </div>
      <div class="mt-3 font-mono text-xs text-muted-foreground">
        Samples: {freshLiveSampleCount}
      </div>
    </div>
    <div class="rounded-xl border bg-muted/20 p-4">
      <div class="grid text-sm">
        <span class="font-medium">Fresh Host</span>
        <span class="text-muted-foreground">{freshHostSubtitle}</span>
      </div>
      <div class="mt-3 font-mono text-3xl font-semibold">
        {Math.round(freshHostCircularity.score)}
      </div>
      <div class="mt-3 font-mono text-xs text-muted-foreground">
        Samples: {freshHostSampleCount}
      </div>
    </div>
  </div>
</div>

<JoystickDiagnosticPlot
  title="Calibration Sweep Shape"
  subtitle="Shows the predicted firmware output after the next calibration and circular correction."
  points={displayedSweepPoints}
  pointClass="fill-sky-500/20"
  lastPointClass="fill-sky-500 stroke-background stroke-2"
/>
