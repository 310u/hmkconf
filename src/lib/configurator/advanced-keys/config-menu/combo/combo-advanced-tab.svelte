<script lang="ts">
  import CommitSlider from "$lib/components/commit-slider.svelte"
  import {
    MAX_TAPPING_TERM,
    MIN_TAPPING_TERM,
    type HMK_AKCombo,
  } from "$lib/libhmk/advanced-keys"
  import { cn, type WithoutChildren } from "$lib/utils"
  import type { HTMLAttributes } from "svelte/elements"
  import { configMenuStateContext } from "../context.svelte"

  const {
    class: className,
    ...props
  }: WithoutChildren<HTMLAttributes<HTMLDivElement>> = $props()

  const configMenuState = configMenuStateContext.get()
  const action = $derived(configMenuState.advancedKey.action as HMK_AKCombo)
</script>

<div class={cn("flex flex-col gap-4", className)} {...props}>
  <CommitSlider
    bind:committed={
      () => action.term,
      (v) => configMenuState.updateAction({ ...action, term: v })
    }
    description="Set the time window in milliseconds for the combo keys to be pressed."
    display={(v) => `${v}ms`}
    min={MIN_TAPPING_TERM}
    max={MAX_TAPPING_TERM}
    step={10}
    title="Combo Term"
  />
</div>
