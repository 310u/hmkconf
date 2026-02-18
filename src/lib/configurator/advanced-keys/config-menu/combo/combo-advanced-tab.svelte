<!--
  Combo Advanced Tab

  Provides the "Combo Term" configuration input. The term defines the maximum
  time window (ms) between key presses for a combo to be recognized.

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
  import { Input } from "$lib/components/ui/input"
  import { Label } from "$lib/components/ui/label"
  import type { HMK_AKCombo } from "$lib/libhmk/advanced-keys"
  import type { HTMLAttributes } from "svelte/elements"
  import { configMenuStateContext } from "../context.svelte"

  let { ...props }: HTMLAttributes<HTMLDivElement> = $props()

  const configMenuState = configMenuStateContext.get()
  const action = $derived(configMenuState.advancedKey.action as HMK_AKCombo)
</script>

<div class="flex flex-col gap-6 p-4" {...props}>
  <div class="flex flex-col gap-3">
    <Label for="combo-term">Combo Term (ms)</Label>
    <Input
      class="w-full"
      id="combo-term"
      max={500}
      min={1}
      oninput={(e) => {
        const term = parseInt(e.currentTarget.value)
        if (!isNaN(term)) {
          configMenuState.updateAction({ ...action, term })
        }
      }}
      type="number"
      value={action.term}
    />
    <p class="text-xs text-muted-foreground">
      Max time (ms) between key presses to trigger the combo.
    </p>
  </div>
</div>
