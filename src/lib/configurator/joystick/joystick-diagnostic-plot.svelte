<script lang="ts">
  import { cn, type WithoutChildren } from "$lib/utils"
  import type { HTMLAttributes } from "svelte/elements"
  import type { JoystickVector } from "./joystick-diagnostics"

  const PLOT_SIZE = 256
  const PLOT_CENTER = PLOT_SIZE / 2
  const PLOT_RADIUS = 112

  let {
    class: className,
    title,
    subtitle = "",
    points = [],
    pointClass = "fill-primary/25",
    lastPointClass = "fill-primary stroke-background stroke-2",
    ...props
  }: WithoutChildren<HTMLAttributes<HTMLDivElement>> & {
    title: string
    subtitle?: string
    points?: JoystickVector[]
    pointClass?: string
    lastPointClass?: string
  } = $props()

  const displayPoints = $derived.by(() =>
    points.slice(-120).map((point) => ({
      cx: PLOT_CENTER + (point.x / 128) * PLOT_RADIUS,
      cy: PLOT_CENTER - (point.y / 128) * PLOT_RADIUS,
    })),
  )

  const lastPoint = $derived.by(() => displayPoints.at(-1) ?? null)
</script>

<div class={cn("rounded-xl border bg-card p-4", className)} {...props}>
  <div class="mb-3 grid text-sm">
    <span class="font-medium">{title}</span>
    {#if subtitle}
      <span class="text-muted-foreground">{subtitle}</span>
    {/if}
  </div>

  <div class="aspect-square rounded-lg border bg-muted/30 p-3">
    <svg class="size-full" viewBox="0 0 {PLOT_SIZE} {PLOT_SIZE}">
      <line
        class="stroke-border"
        x1={PLOT_CENTER}
        y1="8"
        x2={PLOT_CENTER}
        y2={PLOT_SIZE - 8}
        vector-effect="non-scaling-stroke"
      />
      <line
        class="stroke-border"
        x1="8"
        y1={PLOT_CENTER}
        x2={PLOT_SIZE - 8}
        y2={PLOT_CENTER}
        vector-effect="non-scaling-stroke"
      />
      <circle
        class="fill-none stroke-border"
        cx={PLOT_CENTER}
        cy={PLOT_CENTER}
        r={PLOT_RADIUS}
        vector-effect="non-scaling-stroke"
      />
      <circle
        class="fill-none stroke-border/70"
        cx={PLOT_CENTER}
        cy={PLOT_CENTER}
        r={PLOT_RADIUS / 2}
        vector-effect="non-scaling-stroke"
      />

      {#each displayPoints as point, index (index)}
        <circle class={pointClass} cx={point.cx} cy={point.cy} r="2.2" />
      {/each}

      {#if lastPoint}
        <circle
          class={lastPointClass}
          cx={lastPoint.cx}
          cy={lastPoint.cy}
          r="4"
          vector-effect="non-scaling-stroke"
        />
      {/if}
    </svg>
  </div>

  <div
    class="mt-3 flex items-center justify-between font-mono text-[11px] text-muted-foreground"
  >
    <span>{points.length} samples</span>
    <span>-128..127</span>
  </div>
</div>
