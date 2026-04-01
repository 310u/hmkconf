import type { Keyboard } from "$lib/keyboard"
import {
  HMK_JOYSTICK_SCROLL_PROFILE_LEGACY,
  HMK_JOYSTICK_SCROLL_PROFILE_SMOOTH,
} from "$lib/libhmk/commands/joystick"
import type {
  HMK_JoystickConfig,
  HMK_JoystickMousePreset,
} from "$lib/libhmk/commands/joystick"

export const JOYSTICK_MODE_OPTIONS = [
  { value: "0", label: "Disabled" },
  { value: "1", label: "Mouse" },
  { value: "2", label: "XInput Left Stick" },
  { value: "3", label: "XInput Right Stick" },
  { value: "4", label: "Scroll" },
  { value: "5", label: "Cursor 4-way" },
  { value: "6", label: "Cursor 8-way" },
] as const

export const JOYSTICK_SCROLL_PROFILE_OPTIONS = [
  {
    value: String(HMK_JOYSTICK_SCROLL_PROFILE_LEGACY),
    label: "Legacy",
  },
  {
    value: String(HMK_JOYSTICK_SCROLL_PROFILE_SMOOTH),
    label: "Smooth",
  },
] as const

type JoystickConfigEqualityOptions = {
  supportsJoystickMousePresets: boolean
}

type PersistJoystickConfigParams = {
  keyboard: Keyboard
  profile: number
  updated: HMK_JoystickConfig
  supportsJoystickMousePresets: boolean
}

type PersistJoystickConfigResult = {
  persisted: HMK_JoystickConfig
  configReadbackVerified: boolean | null
}

type PersistSharedCalibrationParams = {
  keyboard: Keyboard
  profile: number
  selectedConfig: HMK_JoystickConfig
  candidate: Pick<HMK_JoystickConfig, "x" | "y" | "radialBoundaries">
  restoredMode: number | null
  runtimeProfile: number
  supportsJoystickMousePresets: boolean
}

type PersistSharedCalibrationResult = PersistJoystickConfigResult & {
  runtimeProfileConfig: HMK_JoystickConfig | null
  runtimeProfileConfigProfile: number | null
}

export function getJoystickModeLabel(mode: number) {
  return (
    JOYSTICK_MODE_OPTIONS.find((entry) => Number(entry.value) === mode)
      ?.label ?? "Unknown"
  )
}

export function buildUpdatedActiveMousePresetConfig(
  config: HMK_JoystickConfig,
  nextPreset: Partial<HMK_JoystickMousePreset>,
  supportsJoystickMousePresets: boolean,
): HMK_JoystickConfig {
  if (!supportsJoystickMousePresets) {
    return {
      ...config,
      mouseSpeed: nextPreset.mouseSpeed ?? config.mouseSpeed,
      mouseAcceleration:
        nextPreset.mouseAcceleration ?? config.mouseAcceleration,
    }
  }

  const activePreset = {
    ...config.mousePresets[config.activeMousePreset],
    ...nextPreset,
  }
  const mousePresets = config.mousePresets.map((preset, index) =>
    index === config.activeMousePreset ? activePreset : preset,
  )

  return {
    ...config,
    mouseSpeed: activePreset.mouseSpeed,
    mouseAcceleration: activePreset.mouseAcceleration,
    mousePresets,
  }
}

export function buildSelectedMousePresetConfig(
  config: HMK_JoystickConfig,
  index: number,
): HMK_JoystickConfig {
  const nextIndex = Math.max(0, Math.min(index, config.mousePresets.length - 1))
  const preset = config.mousePresets[nextIndex]

  return {
    ...config,
    activeMousePreset: nextIndex,
    mouseSpeed: preset.mouseSpeed,
    mouseAcceleration: preset.mouseAcceleration,
  }
}

export function joystickConfigsEqual(
  left: HMK_JoystickConfig,
  right: HMK_JoystickConfig,
  options: JoystickConfigEqualityOptions,
) {
  const { supportsJoystickMousePresets } = options

  return (
    left.x.min === right.x.min &&
    left.x.center === right.x.center &&
    left.x.max === right.x.max &&
    left.y.min === right.y.min &&
    left.y.center === right.y.center &&
    left.y.max === right.y.max &&
    left.deadzone === right.deadzone &&
    left.mode === right.mode &&
    left.mouseSpeed === right.mouseSpeed &&
    left.mouseAcceleration === right.mouseAcceleration &&
    left.swDebounceMs === right.swDebounceMs &&
    left.scrollProfile === right.scrollProfile &&
    (!supportsJoystickMousePresets ||
      (left.activeMousePreset === right.activeMousePreset &&
        left.mousePresets.length === right.mousePresets.length &&
        left.mousePresets.every(
          (preset, index) =>
            preset.mouseSpeed === right.mousePresets[index]?.mouseSpeed &&
            preset.mouseAcceleration ===
              right.mousePresets[index]?.mouseAcceleration,
        ))) &&
    left.radialBoundaries.length === right.radialBoundaries.length &&
    left.radialBoundaries.every(
      (boundary, index) => boundary === right.radialBoundaries[index],
    )
  )
}

export async function persistJoystickConfigToKeyboard(
  params: PersistJoystickConfigParams,
): Promise<PersistJoystickConfigResult> {
  const { keyboard, profile, updated, supportsJoystickMousePresets } = params

  await keyboard.setJoystickConfig?.({ profile, config: updated })

  if (!keyboard.getJoystickConfig) {
    return {
      persisted: updated,
      configReadbackVerified: null,
    }
  }

  const persisted = await keyboard.getJoystickConfig({ profile })
  const configReadbackVerified = joystickConfigsEqual(updated, persisted, {
    supportsJoystickMousePresets,
  })

  if (!configReadbackVerified) {
    throw new Error("Joystick config read-back mismatch")
  }

  return {
    persisted,
    configReadbackVerified,
  }
}

export async function persistSharedCalibrationToKeyboard(
  params: PersistSharedCalibrationParams,
): Promise<PersistSharedCalibrationResult> {
  const {
    keyboard,
    profile,
    selectedConfig,
    candidate,
    restoredMode,
    runtimeProfile,
    supportsJoystickMousePresets,
  } = params

  const selectedUpdated = {
    ...selectedConfig,
    x: candidate.x,
    y: candidate.y,
    radialBoundaries: [...candidate.radialBoundaries],
    ...(restoredMode !== null ? { mode: restoredMode } : {}),
  }

  if (
    keyboard.metadata.numProfiles <= 1 ||
    !keyboard.getJoystickConfig ||
    !keyboard.setJoystickConfig
  ) {
    const result = await persistJoystickConfigToKeyboard({
      keyboard,
      profile,
      updated: selectedUpdated,
      supportsJoystickMousePresets,
    })

    return {
      ...result,
      runtimeProfileConfig: null,
      runtimeProfileConfigProfile: null,
    }
  }

  for (
    let targetProfile = 0;
    targetProfile < keyboard.metadata.numProfiles;
    targetProfile += 1
  ) {
    const existing = await keyboard.getJoystickConfig({
      profile: targetProfile,
    })
    const updated = {
      ...existing,
      x: candidate.x,
      y: candidate.y,
      radialBoundaries: [...candidate.radialBoundaries],
      ...(targetProfile === profile && restoredMode !== null
        ? { mode: restoredMode }
        : {}),
    }
    await keyboard.setJoystickConfig({
      profile: targetProfile,
      config: updated,
    })
  }

  const persisted = await keyboard.getJoystickConfig({ profile })
  const configReadbackVerified = joystickConfigsEqual(
    selectedUpdated,
    persisted,
    {
      supportsJoystickMousePresets,
    },
  )

  if (!configReadbackVerified) {
    throw new Error("Joystick config read-back mismatch")
  }

  if (runtimeProfile !== profile) {
    return {
      persisted,
      configReadbackVerified,
      runtimeProfileConfig: await keyboard.getJoystickConfig({
        profile: runtimeProfile,
      }),
      runtimeProfileConfigProfile: runtimeProfile,
    }
  }

  return {
    persisted,
    configReadbackVerified,
    runtimeProfileConfig: null,
    runtimeProfileConfigProfile: null,
  }
}
