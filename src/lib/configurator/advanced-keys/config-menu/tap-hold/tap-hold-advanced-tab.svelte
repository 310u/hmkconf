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
  import { InfoIcon } from "@lucide/svelte"
  import CommitSlider from "$lib/components/commit-slider.svelte"
  import Switch from "$lib/components/switch.svelte"
  import { Label } from "$lib/components/ui/label"
  import * as RadioGroup from "$lib/components/ui/radio-group"
  import * as Tooltip from "$lib/components/ui/tooltip"
  import { tapHoldFlavorMetadata } from "$lib/configurator/lib/advanced-keys"
  import {
    MAX_QUICK_TAP_MS,
    MAX_REQUIRE_PRIOR_IDLE_MS,
    MAX_TAPPING_TERM,
    MIN_TAPPING_TERM,
    type HMK_AKTapHold,
  } from "$lib/libhmk/advanced-keys"
  import { cn, type WithoutChildren } from "$lib/utils"
  import type { HTMLAttributes } from "svelte/elements"
  import { configMenuStateContext } from "../context.svelte"
  import TickRateSlider from "../tick-rate-slider.svelte"

  const {
    class: className,
    ...props
  }: WithoutChildren<HTMLAttributes<HTMLDivElement>> = $props()

  const configMenuState = configMenuStateContext.get()
  const action = $derived(configMenuState.advancedKey.action as HMK_AKTapHold)
</script>

<div class={cn("flex flex-col gap-4", className)} {...props}>
  <div class="grid text-sm text-wrap">
    <span class="font-medium">Interrupt Flavor</span>
    <span class="text-muted-foreground">
      Select how the hold-tap resolves when another key is pressed while the
      hold-tap key is held.
    </span>
  </div>
  <RadioGroup.Root
    bind:value={
      () => String(action.flavor),
      (v) => configMenuState.updateAction({ ...action, flavor: Number(v) })
    }
  >
    {#each tapHoldFlavorMetadata as { flavor, title, description } (flavor)}
      <div class="flex items-center gap-3">
        <RadioGroup.Item id={String(flavor)} value={String(flavor)} />
        <div class="flex flex-1 items-center gap-2">
          <Label class="flex-1" for={String(flavor)}>{title}</Label>
          <Tooltip.Root>
            <Tooltip.Trigger>
              <InfoIcon class="size-4" />
              <span class="sr-only">Info</span>
            </Tooltip.Trigger>
            <Tooltip.Content>{description}</Tooltip.Content>
          </Tooltip.Root>
        </div>
      </div>
    {/each}
  </RadioGroup.Root>
  <Switch
    bind:checked={
      () => action.retroTapping,
      (v) => configMenuState.updateAction({ ...action, retroTapping: v })
    }
    description="Perform the tap action if the key is held longer than the tapping term and released without any other key being pressed."
    id="retro-tapping"
    title="Retro Tapping"
  />
  <CommitSlider
    bind:committed={
      () => action.tappingTerm,
      (v) => configMenuState.updateAction({ ...action, tappingTerm: v })
    }
    description="Set the duration the key must be held to perform the hold action."
    display={(v) => `${v}ms`}
    min={MIN_TAPPING_TERM}
    max={MAX_TAPPING_TERM}
    step={10}
    title="Tapping Term"
  />
  <CommitSlider
    bind:committed={
      () => action.quickTapMs,
      (v) => configMenuState.updateAction({ ...action, quickTapMs: v })
    }
    description="If the key is re-pressed within this time of the last tap, it will always produce a tap. Set to 0 to disable."
    display={(v) => (v === 0 ? "Disabled" : `${v}ms`)}
    min={0}
    max={MAX_QUICK_TAP_MS}
    step={10}
    title="Quick Tap"
  />
  <CommitSlider
    bind:committed={
      () => action.requirePriorIdleMs,
      (v) => configMenuState.updateAction({ ...action, requirePriorIdleMs: v })
    }
    description="If pressed within this time of another key press, it will always produce a tap. Useful for home-row mods. Set to 0 to disable."
    display={(v) => (v === 0 ? "Disabled" : `${v}ms`)}
    min={0}
    max={MAX_REQUIRE_PRIOR_IDLE_MS}
    step={10}
    title="Require Prior Idle"
  />
  <TickRateSlider />
</div>
