<script lang="ts">
  import {
    toggleVariants,
    type ToggleVariants,
  } from "$lib/components/ui/toggle/index.js"
  import { cn } from "$lib/utils.js"
  import { ToggleGroup as ToggleGroupPrimitive } from "bits-ui"
  import { getToggleGroupCtx } from "./toggle-group.svelte"

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    size,
    variant,
    ...restProps
  }: ToggleGroupPrimitive.ItemProps & ToggleVariants = $props()

  const ctx = getToggleGroupCtx()
  const groupVariant = $derived(ctx.variant?.())
  const groupSize = $derived(ctx.size?.())
  const groupSpacing = $derived(ctx.spacing?.())
</script>

<ToggleGroupPrimitive.Item
  bind:ref
  data-slot="toggle-group-item"
  data-variant={groupVariant || variant}
  data-size={groupSize || size}
  data-spacing={groupSpacing}
  class={cn(
    toggleVariants({
      variant: groupVariant || variant,
      size: groupSize || size,
    }),
    "w-auto min-w-0 shrink-0 px-3 focus:z-10 focus-visible:z-10 data-[spacing=0]:rounded-none data-[spacing=0]:shadow-none data-[spacing=0]:first:rounded-l-md data-[spacing=0]:last:rounded-r-md data-[spacing=0]:data-[variant=outline]:border-l-0 data-[spacing=0]:data-[variant=outline]:first:border-l",
    className,
  )}
  {value}
  {...restProps}
/>
