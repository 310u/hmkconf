<script lang="ts">
  import * as Sheet from "$lib/components/ui/sheet/index.js"
  import { cn, type WithElementRef } from "$lib/utils.js"
  import type { HTMLAttributes } from "svelte/elements"
  import { SIDEBAR_WIDTH_MOBILE } from "./constants.js"
  import { useSidebar } from "./context.svelte.js"

  let {
    ref = $bindable(null),
    side = "left",
    variant = "sidebar",
    collapsible = "offcanvas",
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
    side?: "left" | "right"
    variant?: "sidebar" | "floating" | "inset"
    collapsible?: "offcanvas" | "icon" | "none"
  } = $props()

  const sidebar = useSidebar()
</script>

{#if collapsible === "none"}
  <div
    class={cn(
      "flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground",
      className,
    )}
    bind:this={ref}
    {...restProps}
  >
    {@render children?.()}
  </div>
{:else if sidebar.isMobile}
  <Sheet.Root
    bind:open={() => sidebar.openMobile, (v) => sidebar.setOpenMobile(v)}
    {...restProps}
  >
    <Sheet.Content
      data-sidebar="sidebar"
      data-slot="sidebar"
      data-mobile="true"
      class="w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
      style="--sidebar-width: {SIDEBAR_WIDTH_MOBILE};"
      {side}
    >
      <Sheet.Header class="sr-only">
        <Sheet.Title>Sidebar</Sheet.Title>
        <Sheet.Description>Displays the mobile sidebar.</Sheet.Description>
      </Sheet.Header>
      <div class="flex h-full w-full flex-col">
        {@render children?.()}
      </div>
    </Sheet.Content>
  </Sheet.Root>
{:else}
  <div
    bind:this={ref}
    class={cn(
      "group peer relative flex h-svh shrink-0 overflow-hidden text-sidebar-foreground transition-[width] duration-200 ease-linear",
      variant === "floating" || variant === "inset"
        ? "w-(--sidebar-width) p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)] group-data-[collapsible=offcanvas]:w-0"
        : "w-(--sidebar-width) group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[collapsible=offcanvas]:w-0",
      className,
    )}
    data-state={sidebar.state}
    data-collapsible={sidebar.state === "collapsed" ? collapsible : ""}
    data-variant={variant}
    data-side={side}
    data-slot="sidebar"
    {...restProps}
  >
    <div
      data-sidebar="sidebar"
      data-slot="sidebar-inner"
      class={cn(
        "flex h-full w-full flex-col bg-sidebar",
        variant === "floating" || variant === "inset"
          ? "rounded-lg border border-sidebar-border shadow-sm"
          : side === "left"
            ? "border-r"
            : "border-l",
      )}
    >
      {@render children?.()}
    </div>
  </div>
{/if}
