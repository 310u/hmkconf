<!--
  Combo Bindings Tab

  Provides the keycode selection accordion for assigning the combo's output
  keycode. When the output binding button is toggled in the parent config menu,
  selecting a keycode in this tab updates the combo's outputKeycode via
  configMenuState.updateAction.

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
  import FixedScrollArea from "$lib/components/fixed-scroll-area.svelte"
  import KeycodeAccordion from "$lib/components/keycode-accordion.svelte"
  import type { HMK_AKCombo } from "$lib/libhmk/advanced-keys"
  import type { ComponentProps } from "svelte"
  import type { HTMLAttributes } from "svelte/elements"
  import { configMenuStateContext } from "../context.svelte"
  import { comboConfigMenuStateContext } from "./context.svelte"

  let props: ComponentProps<typeof KeycodeAccordion> = $props()

  const checkConfigMenuState = comboConfigMenuStateContext.get()
  const configMenuState = configMenuStateContext.get()
  const action = $derived(configMenuState.advancedKey.action as HMK_AKCombo)
</script>

<KeycodeAccordion
  onKeycodeSelected={(keycode) => {
    if (checkConfigMenuState.bindingSelected) {
      configMenuState.updateAction({ ...action, outputKeycode: keycode })
      checkConfigMenuState.bindingSelected = false
    }
  }}
  {...props}
/>
