<script lang="ts">
  import KeycodeAccordion from "$lib/components/keycode-accordion.svelte"
  import type { HMK_AKCombo } from "$lib/libhmk/advanced-keys"
  import type { ComponentProps } from "svelte"
  import { configMenuStateContext } from "../context.svelte"
  import { comboConfigMenuStateContext } from "./combo-context.svelte"

  const props: ComponentProps<typeof KeycodeAccordion> = $props()

  const configMenuState = configMenuStateContext.get()
  const comboConfigMenuState = comboConfigMenuStateContext.get()
  const action = $derived(configMenuState.advancedKey.action as HMK_AKCombo)
</script>

<KeycodeAccordion
  onKeycodeSelected={(keycode: number) => {
    if (comboConfigMenuState.bindingSelected) {
      configMenuState.updateAction({
        ...action,
        keycode,
      })
    }
  }}
  {...props}
/>
