/*
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later
 * version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { analogCurvePresets } from "$lib/configurator/lib/gamepad"
import { HMK_FIRMWARE_MAX_VERSION, type HMK_Options } from "$lib/libhmk"
import { defaultActuation, type HMK_Actuation } from "$lib/libhmk/actuation"
import {
  DEFAULT_TICK_RATE,
  defaultAdvancedKey,
  NUM_MACROS,
  type HMK_AdvancedKey,
  type HMK_Macro,
} from "$lib/libhmk/advanced-keys"
import type {
  GetJoystickConfigParams,
  HMK_JoystickConfig,
  HMK_JoystickState,
  SetJoystickConfigParams,
} from "$lib/libhmk/commands/joystick"
import type { HMK_RgbConfig } from "$lib/libhmk/commands/rgb"
import { HMK_GamepadButton, type HMK_GamepadOptions } from "$lib/libhmk/gamepad"
import type {
  DuplicateProfileParams,
  GetActuationMapParams,
  GetAdvancedKeysParams,
  GetGamepadButtonsParams,
  GetGamepadOptionsParams,
  GetKeymapParams,
  GetMacrosParams,
  GetTickRateParams,
  Keyboard,
  ResetProfileParams,
  SetActuationMapParams,
  SetAdvancedKeysParams,
  SetGamepadButtonsParams,
  SetGamepadOptionsParams,
  SetKeymapParams,
  SetMacrosParams,
  SetOptionsParams,
  SetTickRateParams,
} from "."
import { demoMetadata } from "./metadata"

const { adcResolution, numProfiles, numKeys, numAdvancedKeys, defaultKeymaps } =
  demoMetadata

type DemoKeyboardProfileState = {
  keymap: number[][]
  actuationMap: HMK_Actuation[]
  advancedKeys: HMK_AdvancedKey[]
  macros: HMK_Macro[]
  gamepadButtons: number[]
  gamepadOptions: HMK_GamepadOptions
  tickRate: number
  rgbConfig: HMK_RgbConfig
}

function defaultProfile(profile: number): DemoKeyboardProfileState {
  return {
    keymap: defaultKeymaps[profile],
    actuationMap: Array(numKeys).fill(defaultActuation),
    advancedKeys: Array(numAdvancedKeys).fill(defaultAdvancedKey),
    macros: Array(NUM_MACROS).fill({ events: [] }),
    gamepadButtons: Array(numKeys).fill(HMK_GamepadButton.NONE),
    gamepadOptions: {
      analogCurve: analogCurvePresets[0].curve,
      keyboardEnabled: true,
      gamepadOverride: false,
      squareJoystick: false,
      snappyJoystick: true,
    },
    tickRate: DEFAULT_TICK_RATE,
    rgbConfig: {
      enabled: 1,
      globalBrightness: 51,
      currentEffect: 1,
      solidColor: { r: 255, g: 0, b: 0 },
      secondaryColor: { r: 255, g: 255, b: 255 },
      effectSpeed: 128,
      sleepTimeout: 0,
      layerIndicatorMode: 0,
      layerIndicatorKey: 0,
      layerColors: Array(demoMetadata.numLayers).fill({ r: 0, g: 0, b: 0 }),
      perKeyColors: Array(numKeys).fill({ r: 255, g: 0, b: 0 }),
    },
  }
}

type DemoKeyboardState = {
  options: HMK_Options
  profiles: DemoKeyboardProfileState[]
}

export class DemoKeyboard implements Keyboard {
  id = "demo"
  demo = true
  version = HMK_FIRMWARE_MAX_VERSION
  metadata = demoMetadata

  #state: DemoKeyboardState = {
    options: {
      xInputEnabled: true,
      saveBottomOutThreshold: true,
      highPollingRateEnabled: true,
      continuousCalibration: true,
      raw: 0x0f,
    },
    profiles: [...Array(numProfiles)].map((_, i) =>
      structuredClone(defaultProfile(i)),
    ),
  }

  async disconnect() {}
  async forget() {}

  async reboot() {}
  async bootloader() {}
  async factoryReset() {}
  async recalibrate() {}
  async analogInfo() {
    return Array(numKeys).fill({ adcValue: 0, distance: 0 })
  }
  async rawAnalogInfo() {
    return Array(numKeys).fill({ adcValue: 0, distance: 0 })
  }
  async getCalibration() {
    return {
      initialRestValue: (1 << adcResolution) - 1,
      initialBottomOutThreshold: (1 << adcResolution) - 1,
    }
  }
  async setCalibration() {}
  async getProfile() {
    return 0
  }
  async getOptions() {
    return this.#state.options
  }
  async setOptions({ data }: SetOptionsParams) {
    this.#state.options = data
  }
  async resetProfile({ profile }: ResetProfileParams) {
    this.#state.profiles[profile] = structuredClone(defaultProfile(profile))
  }
  async duplicateProfile({ profile, srcProfile }: DuplicateProfileParams) {
    this.#state.profiles[profile] = structuredClone(
      this.#state.profiles[srcProfile],
    )
  }

  async getKeymap({ profile }: GetKeymapParams) {
    return this.#state.profiles[profile].keymap
  }
  async setKeymap({ profile, layer, offset, data }: SetKeymapParams) {
    for (let i = 0; i < data.length; i++) {
      this.#state.profiles[profile].keymap[layer][offset + i] = data[i]
    }
  }
  async getActuationMap({ profile }: GetActuationMapParams) {
    return this.#state.profiles[profile].actuationMap
  }
  async setActuationMap({ profile, offset, data }: SetActuationMapParams) {
    for (let i = 0; i < data.length; i++) {
      this.#state.profiles[profile].actuationMap[offset + i] = data[i]
    }
  }
  async getAdvancedKeys({ profile }: GetAdvancedKeysParams) {
    return this.#state.profiles[profile].advancedKeys
  }
  async setAdvancedKeys({ profile, offset, data }: SetAdvancedKeysParams) {
    for (let i = 0; i < data.length; i++) {
      this.#state.profiles[profile].advancedKeys[offset + i] = data[i]
    }
  }
  async getGamepadButtons(params: GetGamepadButtonsParams): Promise<number[]> {
    return this.#state.profiles[params.profile].gamepadButtons
  }
  async setGamepadButtons({ profile, offset, data }: SetGamepadButtonsParams) {
    for (let i = 0; i < data.length; i++) {
      this.#state.profiles[profile].gamepadButtons[offset + i] = data[i]
    }
  }
  async getGamepadOptions({ profile }: GetGamepadOptionsParams) {
    return this.#state.profiles[profile].gamepadOptions
  }
  async setGamepadOptions({ profile, data }: SetGamepadOptionsParams) {
    this.#state.profiles[profile].gamepadOptions = data
  }
  async getTickRate({ profile }: GetTickRateParams) {
    return this.#state.profiles[profile].tickRate
  }
  async setTickRate({ profile, data }: SetTickRateParams) {
    this.#state.profiles[profile].tickRate = data
  }
  async getMacros({ profile }: GetMacrosParams) {
    return this.#state.profiles[profile].macros
  }
  async setMacros({ profile, offset, data }: SetMacrosParams) {
    for (let i = 0; i < data.length; i++) {
      this.#state.profiles[profile].macros[offset + i] = data[i]
    }
  }
  async getRgbConfig({ profile }: { profile: number }) {
    return this.#state.profiles[profile].rgbConfig
  }
  async setRgbConfig({
    profile,
    data,
  }: {
    profile: number
    data: HMK_RgbConfig
  }) {
    this.#state.profiles[profile].rgbConfig = data
  }
  async getJoystickState(): Promise<HMK_JoystickState> {
    return { rawX: 2048, rawY: 2048, outX: 0, outY: 0, sw: false }
  }
  async getJoystickConfig(
    params: GetJoystickConfigParams,
  ): Promise<HMK_JoystickConfig> {
    void params
    // Return dummy defaults
    return {
      x: { min: 0, center: 2048, max: 4095 },
      y: { min: 0, center: 2048, max: 4095 },
      deadzone: 150,
      mode: 0,
      mouseSpeed: 10,
      mouseAcceleration: 255,
      swDebounceMs: 5,
    }
  }
  async setJoystickConfig(params: SetJoystickConfigParams): Promise<void> {
    void params
    // No-op for demo
  }
}
