<!--
  Combo Config Menu
  
  Main configuration view for a Combo advanced key. Displays the combo's input
  keys and output keycode, along with tabs for bindings, advanced settings,
  and key testing.

  Validation warnings:
  - Output is KC_NO (no action assigned)
  - Duplicate combo (same key set exists on the same layer)
  - Tap-Hold / DKS conflict (combo input key has another advanced key type)
  
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
  import { ArrowRightIcon, InfoIcon, TriangleAlertIcon } from "@lucide/svelte"
  import FixedScrollArea from "$lib/components/fixed-scroll-area.svelte"
  import { KeycodeButton } from "$lib/components/keycode-button"
  import * as Tabs from "$lib/components/ui/tabs"
  import { HMK_AKType, type HMK_AKCombo } from "$lib/libhmk/advanced-keys"
  import { Keycode } from "$lib/libhmk/keycodes"
  import { unitToStyle } from "$lib/ui"
  import { Toggle } from "bits-ui"
  import { advancedKeysStateContext } from "../../../context.svelte"
  import { advancedKeysQueryContext } from "../../../queries/advanced-keys-query.svelte"
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

  const advancedKeysState = advancedKeysStateContext.get()
  const advancedKeysQuery = advancedKeysQueryContext.get()
  const { current: advancedKeys } = $derived(advancedKeysQuery.advancedKeys)
  const currentIndex = $derived(advancedKeysState.index)

  // ── Validation: output is KC_NO ──
  const isOutputEmpty = $derived(action.outputKeycode === Keycode.KC_NO)

  // ── Validation: duplicate combo (same key set on same layer) ──
  const duplicateComboIndex = $derived.by(() => {
    if (!advancedKeys || currentIndex === null) return -1
    const myKeys = [...action.keys].filter((k) => k !== 255).sort()
    if (myKeys.length < 2) return -1

    for (let i = 0; i < advancedKeys.length; i++) {
      if (i === currentIndex) continue
      const ak = advancedKeys[i]
      if (ak.action.type !== HMK_AKType.COMBO || ak.layer !== layer) continue
      const otherKeys = [...(ak.action as HMK_AKCombo).keys]
        .filter((k) => k !== 255)
        .sort()
      if (
        myKeys.length === otherKeys.length &&
        myKeys.every((k, j) => k === otherKeys[j])
      ) {
        return i
      }
    }
    return -1
  })

  // ── Validation: Tap-Hold / DKS conflict ──
  const conflictingKeys = $derived.by(() => {
    if (!advancedKeys || currentIndex === null) return []
    const comboKeys = action.keys.filter((k) => k !== 255)
    const conflicts: { key: number; akType: HMK_AKType }[] = []

    for (const ak of advancedKeys) {
      if (
        ak.action.type === HMK_AKType.NONE ||
        ak.action.type === HMK_AKType.COMBO ||
        ak.layer !== layer
      )
        continue
      if (comboKeys.includes(ak.key)) {
        conflicts.push({ key: ak.key, akType: ak.action.type })
      }
    }
    return conflicts
  })
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

  <!-- Validation warnings -->
  {#if isOutputEmpty}
    <div
      class="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-600 dark:text-yellow-400"
    >
      <TriangleAlertIcon class="mt-0.5 size-4 shrink-0" />
      <span>Output keycode is not assigned. Select a binding below.</span>
    </div>
  {/if}
  {#if duplicateComboIndex !== -1}
    <div
      class="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-600 dark:text-yellow-400"
    >
      <TriangleAlertIcon class="mt-0.5 size-4 shrink-0" />
      <span
        >Another combo with the same key combination exists on this layer. Only
        one will trigger.</span
      >
    </div>
  {/if}
  {#if conflictingKeys.length > 0}
    <div
      class="flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-600 dark:text-blue-400"
    >
      <InfoIcon class="mt-0.5 size-4 shrink-0" />
      <span>
        {#if conflictingKeys.some((c) => c.akType === HMK_AKType.TAP_HOLD)}
          Some combo keys have Tap-Hold configured, which may interfere with
          combo detection timing.
        {:else}
          Some combo keys have other Advanced Key types configured, which may
          affect behavior.
        {/if}
      </span>
    </div>
  {/if}
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
