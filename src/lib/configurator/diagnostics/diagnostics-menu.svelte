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
  import { keyboardContext } from "$lib/keyboard"
  import type { HMK_AnalogInfo } from "$lib/libhmk/commands"
  import { onDestroy } from "svelte"
  import { globalStateContext } from "../context.svelte"

  const DIAGNOSTICS_POLL_INTERVAL = 1000 / 30

  let { class: className, ...props }: any = $props()

  const keyboard = keyboardContext.get()
  const { numKeys, adcResolution } = keyboard.metadata
  const { tab } = $derived(globalStateContext.get())

  let polling = $state(false)
  let pollTimeout = 0
  let lastError = $state("")
  let analogData: HMK_AnalogInfo[] = $state(
    Array(numKeys).fill({ adcValue: 0, distance: 0 }),
  )
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
    } catch (e: any) {
      console.error("Failed to poll analog info, retrying...", e)
      lastError = String(e.message || e)
    }

    if (polling) {
      pollTimeout = window.setTimeout(pollLoop, DIAGNOSTICS_POLL_INTERVAL)
    }
  }

  function startPolling() {
    if (polling) return
    polling = true
    pollLoop()
  }

  function stopPolling() {
    polling = false
    clearTimeout(pollTimeout)
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

  <FixedScrollArea class="flex-1 rounded-md border bg-background p-4">
    <div class="mb-2 text-sm text-muted-foreground">
      Debug: analogData.length = {analogData.length}, numKeys = {numKeys}
      {#if lastError}
        <br /><span class="text-red-500">Error: {lastError}</span>
      {/if}
    </div>
    <div class="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {#each analogData as data, i}
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
