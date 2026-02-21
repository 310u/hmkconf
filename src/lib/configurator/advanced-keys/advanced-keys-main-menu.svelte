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
  import FixedScrollArea from "$lib/components/fixed-scroll-area.svelte"
  import { Button } from "$lib/components/ui/button"
  import { keyboardContext } from "$lib/keyboard"
  import {
    HMK_AKType,
    HMK_NullBindBehavior,
    type HMK_AdvancedKey,
  } from "$lib/libhmk/advanced-keys"
  import { Keycode } from "$lib/libhmk/keycodes"
  import { toast } from "svelte-sonner"
  import { advancedKeysStateContext } from "../context.svelte"
  import { advancedKeyMetadata } from "../lib/advanced-keys"
  import { advancedKeysQueryContext } from "../queries/advanced-keys-query.svelte"
  import { keymapQueryContext } from "../queries/keymap-query.svelte"
  import AdvancedKeysActiveBinding from "./advanced-keys-active-binding.svelte"

  const advancedKeysState = advancedKeysStateContext.get()
  const { numAdvancedKeys } = keyboardContext.get().metadata

  const advancedKeysQuery = advancedKeysQueryContext.get()
  const { current: advancedKeys } = $derived(advancedKeysQuery.advancedKeys)

  const keymapQuery = keymapQueryContext.get()
  const { current: keymap } = $derived(keymapQuery.keymap)

  const count = $derived(
    advancedKeys?.reduce(
      (acc, { action: { type } }) => acc + (type === HMK_AKType.NONE ? 0 : 1),
      0,
    ),
  )

  function applySnapTapWASD() {
    if (!advancedKeys || !keymap) return

    const layer0 = keymap[0]
    if (!layer0) {
      toast.error("Could not read keymap.")
      return
    }

    // Find physical indexes of WASD by searching Layer 0 for their logical Keycodes
    const wIndex = layer0.indexOf(Keycode.KC_W)
    const aIndex = layer0.indexOf(Keycode.KC_A)
    const sIndex = layer0.indexOf(Keycode.KC_S)
    const dIndex = layer0.indexOf(Keycode.KC_D)

    if (wIndex === -1 || aIndex === -1 || sIndex === -1 || dIndex === -1) {
      toast.error("WASD keys not found on Layer 0. Please map them first.")
      return
    }

    const requiredSlots = 4
    let emptySlots = []

    // Find empty slots
    for (let i = 0; i < advancedKeys.length; i++) {
      if (advancedKeys[i].action.type === HMK_AKType.NONE) {
        emptySlots.push(i)
      }
    }

    if (emptySlots.length < requiredSlots) {
      toast.error(
        `Not enough available Advanced Key slots (Need 4, have ${emptySlots.length}). Delete some first.`,
      )
      return
    }

    const newConfigs: HMK_AdvancedKey[] = [...advancedKeys]

    // Helper to create a Null Bind
    const makeNullBind = (
      layer: number,
      primary: number,
      secondary: number,
    ): HMK_AdvancedKey => ({
      layer,
      key: primary,
      action: {
        type: HMK_AKType.NULL_BIND,
        secondaryKey: secondary,
        behavior: HMK_NullBindBehavior.LAST,
        bottomOutPoint: 0,
      },
    })

    // Assign physical keys. Layer is set to 0. Both primary and secondary points to physical key matrix indices.
    newConfigs[emptySlots[0]] = makeNullBind(0, wIndex, sIndex)
    newConfigs[emptySlots[1]] = makeNullBind(0, sIndex, wIndex)
    newConfigs[emptySlots[2]] = makeNullBind(0, aIndex, dIndex)
    newConfigs[emptySlots[3]] = makeNullBind(0, dIndex, aIndex)

    advancedKeysQuery.set({
      offset: 0,
      data: newConfigs,
    })

    toast.success("Global Snap Tap configured for WASD!")
  }
</script>

<div class="grid size-full grid-cols-[28rem_minmax(0,1fr)]">
  <FixedScrollArea class="flex flex-col gap-4 p-4">
    <div class="font-semibold">Quick Actions</div>
    <div class="flex flex-col gap-2">
      <Button
        class="size-full justify-start gap-4 p-2"
        onclick={applySnapTapWASD}
        size="lg"
        variant="default"
      >
        <div
          class="grid size-8 place-items-center rounded-md bg-background/20 text-primary-foreground"
        >
          WASD
        </div>
        <div class="grid text-left text-sm text-wrap">
          <span class="font-medium">WASD Snap Tap (Global SOCD)</span>
          <span class="font-normal text-primary-foreground/80">
            Automatically configures Null Bind on W/S and A/D pairs with Last
            Input Priority.
          </span>
        </div>
      </Button>
    </div>

    <div class="mt-4 font-semibold">Add Advanced Key</div>
    <div class="flex flex-col gap-2">
      {#each advancedKeyMetadata as { type, icon: Icon, title, description } (type)}
        <Button
          class="size-full justify-start gap-4 p-2"
          onclick={() => advancedKeysState.createOpen(type)}
          size="lg"
          variant="outline"
        >
          <Icon class="size-6" />
          <div class="grid text-left text-sm text-wrap">
            <span class="font-medium">{title}</span>
            <span class="font-normal text-muted-foreground">
              {description}
            </span>
          </div>
        </Button>
      {/each}
    </div>
  </FixedScrollArea>
  <FixedScrollArea class="flex flex-col gap-4 p-4">
    <div class="font-semibold">
      Active Advanced Keys ({String(count ?? 0).padStart(2, "0")}/{String(
        numAdvancedKeys,
      ).padStart(2, "0")})
    </div>
    {#if !advancedKeys || !count}
      <div
        class="grid place-items-center rounded-md border border-dashed px-6 py-16 text-center select-none"
      >
        <p class="text-sm text-muted-foreground">No active advanced keys...</p>
      </div>
    {:else}
      <div class="flex flex-col gap-2">
        {#each advancedKeys as advancedKey, i (i)}
          {#if advancedKey.action.type !== HMK_AKType.NONE}
            <AdvancedKeysActiveBinding index={i} {advancedKey} />
          {/if}
        {/each}
      </div>
    {/if}
  </FixedScrollArea>
</div>
