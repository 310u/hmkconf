<script lang="ts">
  import FixedScrollArea from "$lib/components/fixed-scroll-area.svelte"
  import { Badge } from "$lib/components/ui/badge"
  import { Button } from "$lib/components/ui/button"
  import * as Dialog from "$lib/components/ui/dialog"
  import * as Select from "$lib/components/ui/select"
  import { Slider } from "$lib/components/ui/slider"
  import { Switch } from "$lib/components/ui/switch"
  import { analogConfigQueryContext } from "$lib/configurator/queries/analog-config-query.svelte"
  import { analogInfoQueryContext } from "$lib/configurator/queries/analog-info-query.svelte"
  import {
    HMK_AnalogFunction,
    HMK_AnalogType,
    type HMK_AnalogConfig,
  } from "$lib/libhmk/commands/analog-config"
  import { cn, type WithoutChildren } from "$lib/utils"
  import type { HTMLAttributes } from "svelte/elements"

  const {
    class: className,
    ...props
  }: WithoutChildren<HTMLAttributes<HTMLDivElement>> = $props()

  const analogInfoQuery = analogInfoQueryContext.get()
  const analogConfigQuery = analogConfigQueryContext.get()
  const { current: analogInfo } = $derived(analogInfoQuery.analogInfo)
  const { current: analogConfigs } = $derived(analogConfigQuery.analogConfigs)

  const SPECIAL_START = 240
  const SPECIAL_END = 255

  $effect(() => {
    analogInfoQuery.enabled = true
    return () => {
      analogInfoQuery.enabled = false
    }
  })

  // Calibration State
  let calibratedConfig = $state<HMK_AnalogConfig | null>(null)
  let isCalibrating = $state(false)
  let calibrationStep = $state(0) // 0: Min/Max, 1: Center (Centered only)
  let tempMin = $state(4095)
  let tempMax = $state(0)
  let tempCenter = $state(2048)

  function startCalibration(config: HMK_AnalogConfig) {
    calibratedConfig = $state.snapshot(config)
    isCalibrating = true
    calibrationStep = 0
    tempMin = 4095
    tempMax = 0
    tempCenter = 2048
  }

  function handleCalibrationUpdate(val: number) {
    if (!isCalibrating) return

    if (calibrationStep === 0) {
      if (val < tempMin) tempMin = val
      if (val > tempMax) tempMax = val
    } else if (calibrationStep === 1) {
      tempCenter = val
    }
  }

  // Watch value during calibration
  $effect(() => {
    if (isCalibrating && calibratedConfig) {
      const val = analogInfo?.[calibratedConfig.id]?.adcValue ?? 0
      handleCalibrationUpdate(val)
    }
  })

  function nextStep() {
    if (!calibratedConfig) return

    if (
      calibratedConfig.type === HMK_AnalogType.Centered &&
      calibrationStep === 0
    ) {
      calibrationStep = 1
    } else {
      saveCalibration()
    }
  }

  function saveCalibration() {
    if (!calibratedConfig || !analogConfigs) return

    const newConfigs = [...analogConfigs]
    const index = newConfigs.findIndex((c) => c.id === calibratedConfig!.id)

    if (index !== -1) {
      // If Linear, we don't really use center, but we can set it to 0 or mid to be safe.
      // Firmware process_linear doesn't use it.
      // For Centered, we use captured center.
      const finalCenter =
        calibratedConfig.type === HMK_AnalogType.Centered
          ? tempCenter
          : Math.floor((tempMax + tempMin) / 2)

      newConfigs[index] = {
        ...newConfigs[index],
        minValue: tempMin,
        maxValue: tempMax,
        centerValue: finalCenter,
        // deadzone: 100, // Do not overwrite deadzone during calibration
      }
      analogConfigQuery.setAnalogConfigs(newConfigs)
    }
    isCalibrating = false
    calibratedConfig = null
  }

  // Updating function assignment
  function updateFunction(id: number, func: HMK_AnalogFunction) {
    updateConfig(id, { function: func })
  }

  function updateType(id: number, type: HMK_AnalogType) {
    updateConfig(id, { type: type })
  }

  function updateInverted(id: number, inverted: boolean) {
    updateConfig(id, { inverted: inverted })
  }

  function updateDeadzone(id: number, deadzone: number) {
    updateConfig(id, { deadzone: deadzone })
  }

  function updateConfig(id: number, partial: Partial<HMK_AnalogConfig>) {
    if (!analogConfigs) return

    let newConfigs = [...analogConfigs]
    const index = newConfigs.findIndex((c) => c.id === id)

    if (index !== -1) {
      newConfigs[index] = { ...newConfigs[index], ...partial }
    } else {
      // Initialize new
      const emptyIndex = newConfigs.findIndex((c) => c.id === 0)
      if (emptyIndex !== -1) {
        newConfigs[emptyIndex] = {
          id: id,
          function: HMK_AnalogFunction.None,
          type: HMK_AnalogType.Centered,
          inverted: false,
          minValue: 0,
          maxValue: 4095,
          centerValue: 2048,
          deadzone: 200,
          ...partial,
        }
      }
    }
    analogConfigQuery.setAnalogConfigs(newConfigs)
  }

  const FUNCTION_LABELS: Record<number, string> = {
    [HMK_AnalogFunction.None]: "None",
    [HMK_AnalogFunction.MouseX]: "Mouse X",
    [HMK_AnalogFunction.MouseY]: "Mouse Y",
    [HMK_AnalogFunction.GamepadLX]: "Gamepad LS X",
    [HMK_AnalogFunction.GamepadLY]: "Gamepad LS Y",
    [HMK_AnalogFunction.GamepadRX]: "Gamepad RS X",
    [HMK_AnalogFunction.GamepadRY]: "Gamepad RS Y",
    [HMK_AnalogFunction.GamepadLTrig]: "Gamepad LT",
    [HMK_AnalogFunction.GamepadRTrig]: "Gamepad RT",
  }

  const TYPE_LABELS: Record<number, string> = {
    [HMK_AnalogType.Centered]: "Stick (Centered)",
    [HMK_AnalogType.Linear]: "Trigger/Slider (Linear)",
  }
</script>

<FixedScrollArea
  class={cn("flex flex-col gap-4 p-6 pt-2", className)}
  {...props}
>
  <div class="grid text-sm">
    <span class="font-medium">Analog Inputs</span>
    <span class="text-muted-foreground">
      Configure special analog inputs (IDs {SPECIAL_START}-{SPECIAL_END}).
      Assign functions, select type, and calibrate.
    </span>
  </div>

  <div class="grid gap-4">
    {#each Array.from({ length: SPECIAL_END - SPECIAL_START + 1 }, (_, i) => SPECIAL_START + i) as id}
      {@const val = analogInfo?.[id]?.adcValue ?? 0}
      {@const config = analogConfigs?.find(
        (c: HMK_AnalogConfig) => c.id === id,
      )}

      <div class="flex items-center gap-4 rounded-md border p-3">
        <div class="flex w-16 flex-col items-center justify-center gap-1">
          <span class="text-xs font-bold text-muted-foreground">ID</span>
          <Badge variant="outline">{id}</Badge>
        </div>

        <div class="flex flex-1 flex-col gap-2">
          <div class="flex justify-between text-xs">
            <span class="font-mono">Value: {val}</span>
            <span class="text-muted-foreground">Raw (0-4095)</span>
          </div>
          <progress
            value={val}
            max={4095}
            class="h-2 w-full appearance-none overflow-hidden rounded-full bg-secondary [&::-webkit-progress-bar]:bg-secondary [&::-webkit-progress-value]:bg-primary"
          ></progress>

          <div class="mt-2 flex flex-wrap items-center gap-4">
            <!-- Function Select -->
            <Select.Root
              type="single"
              value={String(config?.function ?? 0)}
              onValueChange={(v) => {
                if (v)
                  updateFunction(id, parseInt(String(v)) as HMK_AnalogFunction)
              }}
            >
              <Select.Trigger class="w-[140px]">
                <span class="truncate"
                  >{FUNCTION_LABELS[config?.function ?? 0] || "Function"}</span
                >
              </Select.Trigger>
              <Select.Content>
                {#each Object.entries(FUNCTION_LABELS) as [key, label]}
                  <Select.Item value={key}>{label}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>

            <!-- Type Select -->
            <Select.Root
              type="single"
              value={String(config?.type ?? 0)}
              onValueChange={(v) => {
                if (v) updateType(id, parseInt(String(v)) as HMK_AnalogType)
              }}
              disabled={!config}
            >
              <Select.Trigger class="w-[160px]">
                <span class="truncate"
                  >{TYPE_LABELS[config?.type ?? 0] || "Type"}</span
                >
              </Select.Trigger>
              <Select.Content>
                {#each Object.entries(TYPE_LABELS) as [key, label]}
                  <Select.Item value={key}>{label}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>

            <!-- Inverted Switch -->
            <div class="flex items-center gap-2">
              <Switch
                checked={config?.inverted ?? false}
                onCheckedChange={(v) => updateInverted(id, v)}
                disabled={!config}
              />
              <span
                class="text-xs leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >Inverted</span
              >
            </div>

            <Button
              variant="outline"
              onclick={() => {
                if (config) startCalibration(config)
                else updateFunction(id, HMK_AnalogFunction.None) // Create default then calibrate?
              }}
              disabled={!config}
            >
              Calibrate
            </Button>
          </div>
          <!-- Deadzone Slider -->
          {#if config}
            <div class="mt-1 flex items-center gap-4">
              <span
                class="w-16 text-xs leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >Deadzone</span
              >
              <Slider
                type="multiple"
                class="w-[140px]"
                value={[config.deadzone]}
                min={0}
                max={1000}
                step={10}
                onValueChange={(v) => updateDeadzone(id, v[0])}
              />
              <span class="w-8 text-right font-mono text-xs"
                >{config.deadzone}</span
              >
            </div>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <Dialog.Root
    open={isCalibrating}
    onOpenChange={(open) => !open && (isCalibrating = false)}
  >
    <Dialog.Content>
      <Dialog.Header>
        <Dialog.Title>Calibrate Input {calibratedConfig?.id}</Dialog.Title>
        <Dialog.Description>
          Step {calibrationStep + 1}:
          {#if calibrationStep === 0}
            Move the input to its Minimum and Maximum positions (full range).
          {:else}
            Release the input to its Center position.
          {/if}
        </Dialog.Description>
      </Dialog.Header>

      <div class="py-4">
        <div class="mb-4 text-center font-mono text-4xl">
          {analogInfo?.[calibratedConfig?.id ?? 0]?.adcValue ?? 0}
        </div>
        <div class="flex justify-between text-sm text-muted-foreground">
          <div class="flex flex-col items-center">
            <span>Min</span>
            <span class="font-mono">{tempMin}</span>
          </div>
          {#if calibratedConfig?.type === HMK_AnalogType.Centered}
            <div class="flex flex-col items-center">
              <span>Center</span>
              <span class="font-mono"
                >{calibrationStep >= 1 ? tempCenter : "-"}</span
              >
            </div>
          {/if}
          <div class="flex flex-col items-center">
            <span>Max</span>
            <span class="font-mono">{tempMax}</span>
          </div>
        </div>
      </div>

      <Dialog.Footer>
        <Button onclick={nextStep}>
          {calibratedConfig?.type === HMK_AnalogType.Centered &&
          calibrationStep === 0
            ? "Next"
            : "Save Calibration"}
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
</FixedScrollArea>
