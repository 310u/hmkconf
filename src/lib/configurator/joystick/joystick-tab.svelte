<script lang="ts">
  import { keyboardContext, type Keyboard } from "$lib/keyboard"
  import { cn, type WithoutChildren } from "$lib/utils"
  import type { HTMLAttributes } from "svelte/elements"
  import { globalStateContext } from "../context.svelte"
  import JoystickCalibrationPanel from "./joystick-calibration-panel.svelte"
  import JoystickLiveDiagnosticsPanel from "./joystick-live-diagnostics-panel.svelte"
  import JoystickSettingsPanel from "./joystick-settings-panel.svelte"
  import { createJoystickTabController } from "./joystick-tab-controller.svelte"
  import JoystickTransportValidationPanel from "./joystick-transport-validation-panel.svelte"

  const {
    class: className,
    ...props
  }: WithoutChildren<HTMLAttributes<HTMLDivElement>> = $props()

  const keyboard = keyboardContext.get() as Keyboard
  const { profile, tab } = $derived(globalStateContext.get())
  const controller = createJoystickTabController({
    keyboard,
    getProfile: () => profile,
    getTab: () => tab,
  })
</script>

<div
  class={cn(
    "mx-auto flex size-full max-w-3xl flex-col gap-6 overflow-y-auto p-4",
    className,
  )}
  {...props}
>
  {#if controller.loading || !controller.config}
    <p class="text-muted-foreground">Loading Joystick configuration...</p>
  {:else}
    <JoystickSettingsPanel
      config={controller.config}
      modes={controller.modes}
      scrollProfiles={controller.scrollProfiles}
      supportsJoystickMousePresets={controller.supportsJoystickMousePresets}
      supportsJoystickScrollProfiles={controller.supportsJoystickScrollProfiles}
      onModeChange={(mode) => controller.updateConfig({ mode })}
      onScrollProfileChange={(scrollProfile) =>
        controller.updateConfig({ scrollProfile })}
      onSelectMousePreset={controller.selectMousePreset}
      onUpdateActiveMousePreset={controller.updateActiveMousePreset}
      onDeadzoneChange={(deadzone) => controller.updateConfig({ deadzone })}
      onDebounceChange={(swDebounceMs) =>
        controller.updateConfig({ swDebounceMs })}
    />

    <JoystickLiveDiagnosticsPanel
      {profile}
      joystickState={controller.joystickState}
      currentReferenceOut={controller.currentReferenceOut}
      liveRawPoints={controller.liveRawPoints}
      liveOutPoints={controller.liveOutPoints}
      liveReferenceOutPoints={controller.liveReferenceOutPoints}
      liveRawCircularity={controller.liveRawCircularity}
      liveOutCircularity={controller.liveOutCircularity}
      liveReferenceOutCircularity={controller.liveReferenceOutCircularity}
      sweepCircularity={controller.sweepCircularity}
      freshCapturePhase={controller.freshCapturePhase}
      freshCaptureStatus={controller.freshCaptureStatus}
      freshRawCircularity={controller.freshRawCircularity}
      freshOutCircularity={controller.freshOutCircularity}
      freshHostCircularity={controller.freshHostCircularity}
      freshLiveSampleCount={controller.freshLiveSampleCount}
      freshHostSampleCount={controller.freshHostSampleCount}
      freshHostSubtitle={controller.freshHostSubtitle}
      calibrationPhase={controller.calibrationPhase}
      displayedSweepPoints={controller.displayedSweepPoints}
      onStartFreshCapture={controller.startFreshCapture}
      onCancelFreshCapture={controller.cancelFreshCapture}
      onStopFreshCapture={controller.stopFreshCapture}
      circularityTone={controller.circularityTone}
    />

    <JoystickTransportValidationPanel
      transportValidationAdvice={controller.transportValidationAdvice}
      currentGamepadTransport={controller.currentGamepadTransport}
      hostGamepadBackend={controller.hostGamepadBackend}
      isLinuxHost={controller.isLinuxHost}
      hostGamepadCircularity={controller.hostGamepadCircularity}
      liveLinuxHostInterpretation={controller.liveLinuxHostInterpretation}
      livePredictedLinuxHostCircularity={controller.livePredictedLinuxHostCircularity}
      gamepadHostValidationMode={controller.gamepadHostValidationMode}
      hostGamepadStatus={controller.hostGamepadStatus}
      hostGamepadPoints={controller.hostGamepadPoints}
      hostCircularitySubtitle={controller.hostCircularitySubtitle}
      hostGamepadState={controller.hostGamepadState}
      joystickState={controller.joystickState}
      onResetLiveDiagnostics={controller.resetLiveDiagnostics}
      onCopyDiagnosticLog={controller.copyDiagnosticLog}
      circularityTone={controller.circularityTone}
    />

    <JoystickCalibrationPanel
      calibrationPhase={controller.calibrationPhase}
      numProfiles={keyboard.metadata.numProfiles}
      config={controller.config}
      onStart={controller.startCalibration}
      onCancel={controller.cancelCalibration}
      onNext={controller.nextCalibrationStep}
    />
  {/if}
</div>
