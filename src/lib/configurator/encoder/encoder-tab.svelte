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
  import * as KeyboardEditor from "$lib/components/keyboard-editor"
  import KeycodeAccordion from "$lib/components/keycode-accordion.svelte"
  import * as KeycodeButton from "$lib/components/keycode-button"
  import LayerSelect from "$lib/components/layer-select.svelte"
  import { Button } from "$lib/components/ui/button"
  import { keyboardContext } from "$lib/keyboard"
  import type { WithoutChildren } from "$lib/utils"
  import { cn } from "$lib/utils"
  import type { ComponentProps } from "svelte"
  import { encoderStateContext, globalStateContext } from "../context.svelte"
  import { keymapQueryContext } from "../queries/keymap-query.svelte"

  const {
    ...props
  }: WithoutChildren<ComponentProps<typeof KeyboardEditor.Root>> = $props()

  const encoderState = encoderStateContext.get()
  const { layer, key } = $derived(encoderState)
  const { profile } = $derived(globalStateContext.get())

  const { defaultKeymaps, encoderKeys = [] } = keyboardContext.get().metadata

  const keymapQuery = keymapQueryContext.get()
  const { current: keymap } = $derived(keymapQuery.keymap)

  async function resetEncoderLayer() {
    await Promise.all(
      encoderKeys.map(({ key }) =>
        keymapQuery.set({
          layer,
          offset: key,
          data: [defaultKeymaps[profile][layer][key]],
        }),
      ),
    )
  }
</script>

<KeyboardEditor.Root {...props}>
  <KeyboardEditor.Pane>
    <KeyboardEditor.Menubar>
      <LayerSelect bind:layer={() => layer, (v) => encoderState.setLayer(v)} />
      <Button
        onclick={() => resetEncoderLayer()}
        size="sm"
        variant="destructive"
      >
        Reset Encoder Layer
      </Button>
    </KeyboardEditor.Menubar>
    <KeyboardEditor.Container class="min-h-0 px-4 pb-4">
      <FixedScrollArea class="h-full py-4">
        <div class="grid gap-2">
          {#if encoderKeys.length === 0}
            <div
              class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground"
            >
              No rotary encoder actions are exposed by this keyboard metadata.
            </div>
          {/if}
          {#each encoderKeys as action (action.key)}
            <button
              class={cn(
                "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left transition-colors",
                key === action.key
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50",
              )}
              onclick={() => (encoderState.key = action.key)}
              oncontextmenu={(event) => {
                event.preventDefault()
                keymapQuery.set({ layer, offset: action.key, data: [0] })
              }}
              type="button"
            >
              <div class="min-w-0">
                <div class="truncate text-sm font-medium">{action.label}</div>
                <div class="text-xs text-muted-foreground">
                  Encoder {action.encoder + 1} · {action.direction === "cw"
                    ? "Clockwise"
                    : "Counterclockwise"}
                </div>
              </div>
              {#if !keymap}
                <KeycodeButton.Skeleton />
              {:else}
                <KeycodeButton.Root
                  keycode={keymap[layer][action.key]}
                  showTooltip
                />
              {/if}
            </button>
          {/each}
        </div>
      </FixedScrollArea>
    </KeyboardEditor.Container>
  </KeyboardEditor.Pane>
  <KeyboardEditor.Handle />
  <KeyboardEditor.Pane>
    <KeyboardEditor.Container>
      <FixedScrollArea class="h-full p-4">
        <KeycodeAccordion
          onKeycodeSelected={(keycode) => {
            if (key === null) return
            keymapQuery.set({ layer, offset: key, data: [keycode] })
          }}
        />
      </FixedScrollArea>
    </KeyboardEditor.Container>
  </KeyboardEditor.Pane>
</KeyboardEditor.Root>
