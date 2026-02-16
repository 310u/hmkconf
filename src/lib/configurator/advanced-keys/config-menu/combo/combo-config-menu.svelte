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
  import { ArrowRightIcon } from "@lucide/svelte"
  import FixedScrollArea from "$lib/components/fixed-scroll-area.svelte"
  import { KeycodeButton } from "$lib/components/keycode-button"
  import * as Tabs from "$lib/components/ui/tabs"
  import { type HMK_AKCombo } from "$lib/libhmk/advanced-keys"
  import { Keycode } from "$lib/libhmk/keycodes"
  import { unitToStyle } from "$lib/ui"
  import { Toggle } from "bits-ui"
  import { keymapQueryContext } from "../../../queries/keymap-query.svelte"
  import { configMenuStateContext } from "../context.svelte"
  import KeyTesterTab from "../key-tester-tab.svelte"
  import ComboAdvancedTab from "./combo-advanced-tab.svelte"
  import ComboBindingsTab from "./combo-bindings-tab.svelte"
  import {
    ComboConfigMenuState,
    comboConfigMenuStateContext,
  } from "./context.svelte"

  const comboConfigMenuState = comboConfigMenuStateContext.set(
    new ComboConfigMenuState(),
  )

  const configMenuState = configMenuStateContext.get()
  const action = $derived(configMenuState.advancedKey.action as HMK_AKCombo)

  const keymapQuery = keymapQueryContext.get()
  const { current: keymap } = $derived(keymapQuery.keymap)
  const layer = $derived(configMenuState.advancedKey.layer)
</script>

<FixedScrollArea class="flex flex-col gap-4 p-4 pt-0">
  <div class="grid text-sm">
    <span class="font-medium">Configure Combo Binding</span>
    <span class="text-muted-foreground">
      Assign a binding for the combo action of the keys.
    </span>
  </div>
  <div class="grid place-items-center text-base">
    <div class="flex items-center gap-2">
      <div class="flex items-center gap-1">
        {#each action.keys as key}
          {#if key !== 255 && keymap}
            <div class="p-0.5" style={unitToStyle()}>
              <KeycodeButton keycode={keymap[layer][key]} tabindex={-1} />
            </div>
          {/if}
        {/each}
      </div>

      <ArrowRightIcon class="size-4 text-muted-foreground" />

      <div class="p-0.5" style={unitToStyle()}>
        <Toggle.Root
          bind:pressed={comboConfigMenuState.bindingSelected}
          oncontextmenu={(e) => {
            e.preventDefault()
            configMenuState.updateAction({
              ...action,
              outputKeycode: Keycode.KC_NO,
            })
          }}
        >
          {#snippet child({ props })}
            <KeycodeButton keycode={action.outputKeycode} {...props} />
          {/snippet}
        </Toggle.Root>
      </div>
    </div>
  </div>
</FixedScrollArea>
<FixedScrollArea class="flex flex-col gap-4 p-4 pt-0">
  <Tabs.Root value="bindings">
    <Tabs.List>
      <Tabs.Trigger value="bindings">Bindings</Tabs.Trigger>
      <Tabs.Trigger value="advanced">Advanced</Tabs.Trigger>
      <Tabs.Trigger value="key-tester">Key Tester</Tabs.Trigger>
    </Tabs.List>
    <div class="p-2">
      <Tabs.Content value="bindings">
        {#snippet child({ props })}
          <ComboBindingsTab {...props} />
        {/snippet}
      </Tabs.Content>
      <Tabs.Content value="advanced">
        {#snippet child({ props })}
          <ComboAdvancedTab {...props} />
        {/snippet}
      </Tabs.Content>
      <Tabs.Content value="key-tester">
        {#snippet child({ props })}
          <KeyTesterTab {...props} />
        {/snippet}
      </Tabs.Content>
    </div>
  </Tabs.Root>
</FixedScrollArea>
