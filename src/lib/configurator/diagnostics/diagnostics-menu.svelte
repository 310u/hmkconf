<!-- 
This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version.

This program is distributed in the hope that it will be useful, but WITHOUT
ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
details.

You should have received a copy of the GNU General Public License along with
this program. If not, see <https://www.gnu.org/licenses/>.
-->

<script lang="ts">
  import { PlayIcon, SquareIcon } from "@lucide/svelte"
  import FixedScrollArea from "$lib/components/fixed-scroll-area.svelte"
  import { Button } from "$lib/components/ui/button"
  import CommitSlider from "$lib/components/commit-slider.svelte"
  import { keyboardContext } from "$lib/keyboard"
  import type {
    HMK_AnalogInfo,
    HMK_AnalogScanConfig,
    HMK_AnalogScanDiagnostics,
  } from "$lib/libhmk/commands"
  import { type WithoutChildren } from "$lib/utils"
  import { onDestroy } from "svelte"
  import type { HTMLAttributes } from "svelte/elements"
  import { globalStateContext } from "../context.svelte"

  const DIAGNOSTICS_POLL_INTERVAL = 1000 / 30
  const ANALOG_SCAN_REFRESH_INTERVAL = 1000

  let {
    class: className,
    ...props
  }: WithoutChildren<HTMLAttributes<HTMLDivElement>> = $props()

  const keyboard = keyboardContext.get()
  const { numKeys, adcResolution } = keyboard.metadata
  const { tab } = $derived(globalStateContext.get())

  const analogConfigSupported =
    typeof keyboard.getAnalogScanConfig === "function" &&
    typeof keyboard.setAnalogScanConfig === "function"
  const analogDiagnosticsSupported =
    typeof keyboard.getAnalogScanDiagnostics === "function" &&
    typeof keyboard.resetAnalogScanDiagnostics === "function"

  let polling = $state(false)
  let pollTimeout = 0
  let analogScanRefreshTimeout = 0
  let lastError = $state("")
  let analogData: HMK_AnalogInfo[] = $state(
    Array(numKeys).fill({ adcValue: 0, distance: 0 }),
  )
  let analogScanConfig: HMK_AnalogScanConfig | null = $state(null)
  let analogScanDiagnostics: HMK_AnalogScanDiagnostics | null = $state(null)
  let committedMuxSampleDelayUs = $state(20)
  let wasDiagnosticsTab = false

  const maxAdc = (1 << adcResolution) - 1

  async function pollLoop() {
    if (!polling) return
    try {
      lastError = ""
      const batch = await keyboard.rawAnalogInfo()
      if (batch && batch.length > 0) {
        analogData = batch
      }
    } catch (e: unknown) {
      console.error("Failed to poll analog info, retrying...", e)
      lastError = e instanceof Error ? e.message : String(e)
    }

    if (polling) {
      pollTimeout = window.setTimeout(pollLoop, DIAGNOSTICS_POLL_INTERVAL)
    }
  }

  async function refreshAnalogScanState() {
    if (!analogConfigSupported && !analogDiagnosticsSupported) return

    try {
      lastError = ""

      if (analogConfigSupported) {
        const config = await keyboard.getAnalogScanConfig?.()
        if (config) {
          analogScanConfig = config
          committedMuxSampleDelayUs = config.muxSampleDelayUs
        }
      }

      if (analogDiagnosticsSupported) {
        analogScanDiagnostics =
          (await keyboard.getAnalogScanDiagnostics?.()) ??
          analogScanDiagnostics
      }
    } catch (e: unknown) {
      console.error("Failed to refresh analog scan diagnostics", e)
      lastError = e instanceof Error ? e.message : String(e)
    }

    if (polling) {
      analogScanRefreshTimeout = window.setTimeout(
        refreshAnalogScanState,
        ANALOG_SCAN_REFRESH_INTERVAL,
      )
    }
  }

  async function updateMuxSampleDelay(delay: number) {
    if (!analogConfigSupported) return

    try {
      lastError = ""
      committedMuxSampleDelayUs = delay
      await keyboard.setAnalogScanConfig?.({
        data: { muxSampleDelayUs: delay },
      })
      analogScanConfig = { muxSampleDelayUs: delay }
    } catch (e: unknown) {
      console.error("Failed to update MUX sample delay", e)
      lastError = e instanceof Error ? e.message : String(e)
    }
  }

  async function resetAnalogScanDiagnostics() {
    if (!analogDiagnosticsSupported) return

    try {
      lastError = ""
      await keyboard.resetAnalogScanDiagnostics?.()
      await refreshAnalogScanState()
    } catch (e: unknown) {
      console.error("Failed to reset analog scan diagnostics", e)
      lastError = e instanceof Error ? e.message : String(e)
    }
  }

  function startPolling() {
    if (polling) return
    polling = true
    pollLoop()
    refreshAnalogScanState()
  }

  function stopPolling() {
    polling = false
    clearTimeout(pollTimeout)
    clearTimeout(analogScanRefreshTimeout)
  }

  $effect(() => {
    const isDiagnosticsTab = tab === "diagnostics"

    if (isDiagnosticsTab && !wasDiagnosticsTab) {
      startPolling()
    } else if (!isDiagnosticsTab && wasDiagnosticsTab) {
      stopPolling()
    }

    wasDiagnosticsTab = isDiagnosticsTab
  })

  onDestroy(() => {
    stopPolling()
  })
</script>

<div class={`flex size-full flex-col p-4 ${className || ""}`} {...props}>
  <div class="mb-4 flex items-center justify-between">
    <div class="grid text-sm">
      <h2 class="text-lg font-semibold">
        Diagnostics: Live Analog Sensor Data
      </h2>
      <p class="text-muted-foreground">
        Monitor the raw ADC values and calculated keypress distance in
        real-time. Useful for determining thresholds and assessing sensor
        health.
      </p>
    </div>
    <Button
      variant={polling ? "destructive" : "default"}
      onclick={polling ? stopPolling : startPolling}
      class="w-32"
    >
      {#if polling}
        <SquareIcon class="mr-2 size-4" /> Stop Polling
      {:else}
        <PlayIcon class="mr-2 size-4" /> Start Polling
      {/if}
    </Button>
  </div>

  <div class="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
    <div class="grid gap-4">
      <div class="rounded-md border bg-card p-4">
        <div class="mb-3 flex items-center justify-between">
          <div>
            <h3 class="text-sm font-semibold">MUX Scan Timing</h3>
            <p class="text-sm text-muted-foreground">
              Adjust the per-channel settle delay before ADC sampling.
            </p>
          </div>
          <span class="text-sm text-muted-foreground">
            {analogScanConfig?.muxSampleDelayUs ?? "—"} μs
          </span>
        </div>

        {#if analogConfigSupported}
          <CommitSlider
            title="MUX Sample Delay"
            description="Target a balance between stable ADC sampling and faster analog scan throughput."
            min={1}
            max={50}
            step={1}
            bind:committed={committedMuxSampleDelayUs}
            onCommit={updateMuxSampleDelay}
            display={(value) => `${value} μs`}
          />
        {:else}
          <p class="text-sm text-muted-foreground">
            Runtime MUX scan timing controls are not available on this firmware.
          </p>
        {/if}
      </div>

      <div class="rounded-md border bg-card p-4">
        <div class="mb-3 flex items-center justify-between">
          <div>
            <h3 class="text-sm font-semibold">Analog Scan Diagnostics</h3>
            <p class="text-sm text-muted-foreground">
              Track scan timing and error counts from the analog matrix.
            </p>
          </div>
          {#if analogDiagnosticsSupported}
            <Button variant="secondary" onclick={resetAnalogScanDiagnostics}>
              Reset Diagnostics
            </Button>
          {/if}
        </div>

        {#if analogDiagnosticsSupported}
          <div class="grid gap-3 text-sm">
            <div class="grid grid-cols-2 gap-4 rounded border bg-background p-3 text-xs">
              <span class="text-muted-foreground">Estimated scan rate</span>
              <span class="text-right font-medium">
                {analogScanDiagnostics?.estimatedScanHz ?? "—"} Hz
              </span>
            </div>
            <div class="grid grid-cols-2 gap-4 rounded border bg-background p-3 text-xs">
              <span class="text-muted-foreground">Last scan</span>
              <span class="text-right font-medium">
                {analogScanDiagnostics?.lastScanUs ?? "—"} μs
              </span>
            </div>
            <div class="grid grid-cols-2 gap-4 rounded border bg-background p-3 text-xs">
              <span class="text-muted-foreground">Max scan</span>
              <span class="text-right font-medium">
                {analogScanDiagnostics?.maxScanUs ?? "—"} μs
              </span>
            </div>
            <div class="grid grid-cols-2 gap-4 rounded border bg-background p-3 text-xs">
              <span class="text-muted-foreground">Missed scans</span>
              <span class="text-right font-medium">
                {analogScanDiagnostics?.missedScanCount ?? "—"}
              </span>
            </div>
            <div class="grid grid-cols-2 gap-4 rounded border bg-background p-3 text-xs">
              <span class="text-muted-foreground">SPI errors</span>
              <span class="text-right font-medium">
                {analogScanDiagnostics?.spiErrorCount ?? "—"}
              </span>
            </div>
          </div>
        {:else}
          <p class="text-sm text-muted-foreground">
            Analog scan diagnostics are unavailable on this firmware.
          </p>
        {/if}
      </div>
    </div>
  </div>

  <FixedScrollArea class="flex-1 rounded-md border bg-background p-4">
    <div class="mb-2 text-sm text-muted-foreground">
      Debug: analogData.length = {analogData.length}, numKeys = {numKeys}
      {#if lastError}
        <br /><span class="text-red-500">Error: {lastError}</span>
      {/if}
    </div>
    <div class="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {#each analogData as data, i (i)}
        <div class="flex flex-col gap-1 rounded border bg-card p-3 shadow-sm">
          <div class="flex items-center justify-between text-xs font-medium">
            <span class="text-foreground/80">Key {i}</span>
            <span class="text-muted-foreground"
              >ADC: {data.adcValue} / {maxAdc}</span
            >
          </div>

          <!-- ADC Bar -->
          <div class="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              class="h-full bg-primary transition-all duration-75"
              style="width: {(data.adcValue / maxAdc) * 100}%"
            ></div>
          </div>

          <div
            class="mt-2 flex items-center justify-between text-xs font-medium"
          >
            <span class="text-foreground/80">Distance</span>
            <span class="text-muted-foreground">{data.distance.toFixed(0)}</span
            >
          </div>

          <!-- Distance Bar -->
          <div class="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              class="h-full bg-blue-500 transition-all duration-75"
              style="width: {(data.distance / 255) * 100}%"
            ></div>
          </div>
        </div>
      {/each}
    </div>
  </FixedScrollArea>
</div>
