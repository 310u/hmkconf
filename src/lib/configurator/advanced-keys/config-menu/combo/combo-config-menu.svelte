<script lang="ts">
  import FixedScrollArea from "$lib/components/fixed-scroll-area.svelte"
  import { KeycodeButton } from "$lib/components/keycode-button"
  import * as Tabs from "$lib/components/ui/tabs"
  import { HMK_AKType, type HMK_AKCombo } from "$lib/libhmk/advanced-keys"
  import { Keycode } from "$lib/libhmk/keycodes"
  import { unitToStyle } from "$lib/ui"
  import { Toggle } from "bits-ui"
  import { configMenuStateContext } from "../context.svelte"
  import KeyTesterTab from "../key-tester-tab.svelte"
  import ComboAdvancedTab from "./combo-advanced-tab.svelte"
  import ComboBindingsTab from "./combo-bindings-tab.svelte"
  import {
    ComboConfigMenuState,
    comboConfigMenuStateContext,
  } from "./combo-context.svelte"

  const comboConfigMenuState = comboConfigMenuStateContext.set(
    new ComboConfigMenuState(),
  )

  const configMenuState = configMenuStateContext.get()
  const action = $derived(configMenuState.advancedKey.action as HMK_AKCombo)
</script>

<FixedScrollArea class="flex flex-col gap-4 p-4 pt-0">
  <div class="grid text-sm">
    <span class="font-medium">Configure Combo Binding</span>
    <span class="text-muted-foreground">
      Assign a binding for the combo action of the keys.
    </span>
  </div>
  <div class="grid place-items-center text-base">
    <div class="p-0.5" style={unitToStyle()}>
      <Toggle.Root
        bind:pressed={comboConfigMenuState.bindingSelected}
        oncontextmenu={(e) => {
          e.preventDefault()
          configMenuState.updateAction({
            ...action,
            keycode: Keycode.KC_NO,
          })
        }}
      >
        {#snippet child({ props })}
          <KeycodeButton keycode={action.keycode} {...props} />
        {/snippet}
      </Toggle.Root>
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
