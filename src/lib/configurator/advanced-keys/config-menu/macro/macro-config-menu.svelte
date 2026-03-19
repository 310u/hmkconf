<!--
  Macro Config Menu
  
  Configuration view for a Macro advanced key.
  Left side: Select Macro Index
  Right side: Edit Macro Events
-->

<script lang="ts">
  import { PlusIcon, Trash2Icon, TriangleAlertIcon } from "@lucide/svelte"
  import FixedScrollArea from "$lib/components/fixed-scroll-area.svelte"
  import KeycodeAccordion from "$lib/components/keycode-accordion.svelte"
  import { KeycodeButton } from "$lib/components/keycode-button"
  import { Button } from "$lib/components/ui/button"
  import * as Select from "$lib/components/ui/select"
  import { macrosQueryContext } from "$lib/configurator/queries/macros-query.svelte"
  import {
    HMK_MacroAction,
    MAX_MACRO_EVENTS,
    NUM_MACROS,
    type HMK_AKMacro,
    type HMK_Macro,
  } from "$lib/libhmk/advanced-keys"
  import { Keycode } from "$lib/libhmk/keycodes"
  import { Toggle } from "bits-ui"
  import { configMenuStateContext } from "../context.svelte"
  import {
    MacroConfigMenuState,
    macroConfigMenuStateContext,
  } from "./context.svelte"

  const configMenuState = configMenuStateContext.get()
  const action = $derived(configMenuState.advancedKey.action as HMK_AKMacro)

  const macrosQuery = macrosQueryContext.get()
  const { current: macros } = $derived(macrosQuery.macros)

  // Local state for event selection
  const macroConfigMenuState = macroConfigMenuStateContext.set(
    new MacroConfigMenuState(),
  )

  // Selected macro data
  const macroIndex = $derived(action.macroIndex)
  const currentMacro = $derived(macros?.[macroIndex] ?? { events: [] })

  // Macro selection
  const macroOptions = Array.from({ length: NUM_MACROS }, (_, i) => ({
    value: i,
    label: `Macro ${i + 1}`,
  }))

  function setMacroIndex(index: number) {
    configMenuState.updateAction({
      ...action,
      macroIndex: index,
    })
  }

  // Macro Editing
  function addEvent() {
    if (currentMacro.events.length >= MAX_MACRO_EVENTS) return
    const newEvents = [
      ...currentMacro.events,
      { keycode: Keycode.KC_A, action: HMK_MacroAction.TAP },
    ]
    updateMacro(newEvents)
  }

  function removeEvent(index: number) {
    const newEvents = currentMacro.events.filter((_, i) => i !== index)
    updateMacro(newEvents)
    if (macroConfigMenuState.selectedEventIndex === index) {
      macroConfigMenuState.selectedEventIndex = null
    } else if (
      macroConfigMenuState.selectedEventIndex !== null &&
      macroConfigMenuState.selectedEventIndex > index
    ) {
      macroConfigMenuState.selectedEventIndex--
    }
  }

  function updateEvent(
    index: number,
    event: Partial<HMK_Macro["events"][number]>,
  ) {
    const newEvents = [...currentMacro.events]
    newEvents[index] = { ...newEvents[index], ...event }
    updateMacro(newEvents)
  }

  function updateMacro(events: HMK_Macro["events"]) {
    macrosQuery.set({
      offset: macroIndex,
      data: [{ events }],
    })
  }

  function getActionLabel(action: HMK_MacroAction) {
    switch (action) {
      case HMK_MacroAction.TAP:
        return "Tap"
      case HMK_MacroAction.PRESS:
        return "Press"
      case HMK_MacroAction.RELEASE:
        return "Release"
      case HMK_MacroAction.DELAY:
        return "Delay"
      case HMK_MacroAction.END:
        return "End"
      default:
        return "Unknown"
    }
  }

  function onKeycodeSelected(keycode: number) {
    if (macroConfigMenuState.selectedEventIndex !== null) {
      updateEvent(macroConfigMenuState.selectedEventIndex, { keycode })
      macroConfigMenuState.selectedEventIndex = null
    }
  }
</script>

<FixedScrollArea class="flex flex-col gap-4 p-4 pt-0">
  <div class="grid text-sm">
    <span class="font-medium">Select Macro</span>
    <span class="text-muted-foreground">
      Choose which macro slot to trigger with this key.
    </span>
  </div>

  <div class="grid place-items-center">
    <Select.Root
      value={String(macroIndex)}
      onValueChange={(v) => v && setMacroIndex(Number(v))}
      type="single"
    >
      <Select.Trigger class="w-[180px]">
        Macro {macroIndex + 1}
      </Select.Trigger>
      <Select.Content>
        {#each macroOptions as option (option.value)}
          <Select.Item value={String(option.value)} label={option.label}>
            {option.label}
          </Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </div>

  <div class="mt-4 flex items-center justify-between">
    <div class="grid text-sm">
      <span class="font-medium">Edit Macro {macroIndex + 1}</span>
      <span class="text-muted-foreground">
        Events: {currentMacro.events.length} / {MAX_MACRO_EVENTS}
      </span>
    </div>
    <Button
      size="sm"
      variant="secondary"
      onclick={addEvent}
      disabled={!macros ||
        !!macrosQuery.macros.error ||
        currentMacro.events.length >= MAX_MACRO_EVENTS}
    >
      <PlusIcon class="mr-2 size-4" />
      Add Event
    </Button>
  </div>

  <div class="flex flex-col gap-2">
    {#if macrosQuery.macros.error}
      <div
        class="flex flex-col items-center justify-center py-8 text-destructive"
      >
        <TriangleAlertIcon class="mb-2 size-6" />
        <span class="text-sm font-medium">Failed to load macros.</span>
        <span class="text-xs text-muted-foreground"
          >Check connection or firmware version.</span
        >
      </div>
    {:else if !macros}
      <div
        class="flex flex-col items-center justify-center py-8 text-muted-foreground"
      >
        <span class="text-sm">Loading macros...</span>
      </div>
    {:else if currentMacro.events.length === 0}
      <div
        class="flex flex-col items-center justify-center py-8 text-muted-foreground"
      >
        <span class="text-sm">No events in this macro.</span>
        <Button variant="link" onclick={addEvent}>Add an event to start</Button>
      </div>
    {:else}
      {#each currentMacro.events as event, i (i)}
        <div class="flex items-center gap-2 rounded-md border p-2 text-sm">
          <span class="w-6 text-center text-muted-foreground">{i + 1}</span>

          <Select.Root
            value={String(event.action)}
            onValueChange={(v) => {
              if (v) {
                const newAction = Number(v)
                let newKeycode = event.keycode
                // If switching to DELAY from a key action, reset the value to minimum valid bounds
                if (
                  newAction === HMK_MacroAction.DELAY &&
                  event.action !== HMK_MacroAction.DELAY
                ) {
                  newKeycode = 1
                } else if (
                  newAction !== HMK_MacroAction.DELAY &&
                  event.action === HMK_MacroAction.DELAY
                ) {
                  // If switching away from DELAY, reset to a valid Keycode
                  newKeycode = Keycode.KC_A
                }
                updateEvent(i, { action: newAction, keycode: newKeycode })
              }
            }}
            type="single"
          >
            <Select.Trigger class="h-8 w-[100px]">
              {getActionLabel(event.action)}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value={String(HMK_MacroAction.TAP)}>Tap</Select.Item>
              <Select.Item value={String(HMK_MacroAction.PRESS)}
                >Press</Select.Item
              >
              <Select.Item value={String(HMK_MacroAction.RELEASE)}
                >Release</Select.Item
              >
              <Select.Item value={String(HMK_MacroAction.DELAY)}
                >Delay</Select.Item
              >
            </Select.Content>
          </Select.Root>

          {#if event.action === HMK_MacroAction.DELAY}
            <div class="ml-auto flex items-center gap-1">
              <input
                type="number"
                class="h-8 w-16 rounded-md border bg-transparent px-2 text-right"
                min="10"
                max="2550"
                step="10"
                value={event.keycode * 10}
                onchange={(e) => {
                  let val = Math.round(
                    (parseInt(e.currentTarget.value) || 10) / 10,
                  )
                  val = Math.max(1, Math.min(255, val))
                  updateEvent(i, {
                    keycode: val,
                  })
                }}
              />
              <span class="text-muted-foreground">ms</span>
            </div>
          {:else}
            <div class="ml-auto">
              <Toggle.Root
                pressed={macroConfigMenuState.selectedEventIndex === i}
                onPressedChange={(pressed) => {
                  macroConfigMenuState.selectedEventIndex = pressed ? i : null
                }}
              >
                {#snippet child({ props })}
                  <KeycodeButton keycode={event.keycode} {...props} />
                {/snippet}
              </Toggle.Root>
            </div>
          {/if}

          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8 text-muted-foreground hover:text-destructive"
            onclick={() => removeEvent(i)}
          >
            <Trash2Icon class="size-4" />
          </Button>
        </div>
      {/each}
    {/if}
  </div>
</FixedScrollArea>

<FixedScrollArea class="flex flex-col gap-4 p-4 pt-0">
  <KeycodeAccordion {onKeycodeSelected} />
</FixedScrollArea>
