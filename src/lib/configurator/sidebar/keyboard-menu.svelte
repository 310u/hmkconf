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
  import {
    CableIcon,
    ChevronsUpDownIcon,
    DownloadIcon,
    KeyboardIcon,
    LogOutIcon,
    UploadIcon,
  } from "@lucide/svelte"
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu"
  import * as Sidebar from "$lib/components/ui/sidebar"
  import { displayUInt16 } from "$lib/integer"
  import { keyboardContext } from "$lib/keyboard"
  import { globalStateContext } from "../context.svelte"
  import { KeyboardConfig } from "../lib/keyboard-config.svelte"

  const keyboard = keyboardContext.get()
  const {
    demo,
    metadata: { name, vendorId, productId },
  } = keyboard

  const globalState = globalStateContext.get()
  const config = new KeyboardConfig()

  async function exportProfile() {
    try {
      const data = await config.getConfig(globalState.profile)
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${name.replace(/[^a-z0-9]/gi, "_")}_Profile${globalState.profile}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error("Failed to export profile:", err)
    }
  }

  function triggerImport() {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json"
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        await config.setConfig(globalState.profile, data)
      } catch (err) {
        console.error("Failed to import profile:", err)
        alert("Failed to import profile. Invalid file format.")
      }
    }
    input.click()
  }
</script>

<Sidebar.Menu>
  <Sidebar.MenuItem>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Sidebar.MenuButton
            class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            size="lg"
            {...props}
          >
            <div
              class="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"
            >
              <KeyboardIcon class="size-4" />
            </div>
            <div class="grid flex-1 text-left text-sm leading-tight">
              <span class="truncate font-medium">{name}</span>
              <span class="truncate font-mono text-xs">
                {displayUInt16(vendorId)}
                {displayUInt16(productId)}
              </span>
            </div>
            <ChevronsUpDownIcon class="ml-auto" />
          </Sidebar.MenuButton>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        align="start"
        class="w-(--bits-dropdown-menu-anchor-width) min-w-56 rounded-lg"
      >
        <DropdownMenu.Item class="gap-2 p-2" onSelect={exportProfile}>
          <DownloadIcon class="size-4" />
          Export Profile
        </DropdownMenu.Item>
        <DropdownMenu.Item class="gap-2 p-2" onSelect={triggerImport}>
          <UploadIcon class="size-4" />
          Import Profile
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        {#if demo}
          <DropdownMenu.Item class="gap-2 p-2">
            {#snippet child({ props })}
              <a href="/" {...props}>
                <LogOutIcon class="size-4" />
                Exit Demo
              </a>
            {/snippet}
          </DropdownMenu.Item>
        {:else}
          <DropdownMenu.Item
            class="gap-2 p-2"
            onSelect={() => keyboard.forget()}
          >
            <CableIcon class="size-4" />
            Disconnect
          </DropdownMenu.Item>
        {/if}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </Sidebar.MenuItem>
</Sidebar.Menu>
