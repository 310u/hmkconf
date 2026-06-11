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

import { uint8Schema, uint16Schema, uint32Schema } from "$lib/integer"
import z from "zod"

export enum HMK_Command {
  FIRMWARE_VERSION = 0,
  REBOOT,
  BOOTLOADER,
  FACTORY_RESET,
  RECALIBRATE,
  ANALOG_INFO,
  GET_CALIBRATION,
  SET_CALIBRATION,
  GET_PROFILE,
  GET_OPTIONS,
  SET_OPTIONS,
  RESET_PROFILE,
  DUPLICATE_PROFILE,
  GET_METADATA,
  GET_SERIAL,
  SAVE_CALIBRATION_THRESHOLD,
  ANALOG_INFO_RAW,

  GET_KEYMAP = 128,
  SET_KEYMAP,
  GET_ACTUATION_MAP,
  SET_ACTUATION_MAP,
  GET_ADVANCED_KEYS,
  SET_ADVANCED_KEYS,
  GET_TICK_RATE,
  SET_TICK_RATE,
  GET_GAMEPAD_BUTTONS,
  SET_GAMEPAD_BUTTONS,
  GET_GAMEPAD_OPTIONS,
  SET_GAMEPAD_OPTIONS,
  GET_MACROS,
  SET_MACROS,
  GET_RGB_CONFIG,
  SET_RGB_CONFIG,

  GET_JOYSTICK_STATE,
  GET_JOYSTICK_CONFIG,
  SET_JOYSTICK_CONFIG,
  SET_HOST_TIME,
  GET_TRACKBALL_STATE,
  GET_MATRIX_SCAN_DIAGNOSTICS,
  RESET_MATRIX_SCAN_DIAGNOSTICS,
  GET_ANALOG_SCAN_DIAGNOSTICS,
  RESET_ANALOG_SCAN_DIAGNOSTICS,
  GET_ANALOG_RAW_CHANNELS,
  GET_ANALOG_DEBUG_FRAMES,
  GET_ANALOG_SCAN_CONFIG,
  SET_ANALOG_SCAN_CONFIG,

  UNKNOWN = 255,
}

export const HMK_RAW_HID_EP_SIZE = 64

export const hmkAnalogInfoSchema = z.object({
  adcValue: uint16Schema,
  distance: uint8Schema,
})

export type HMK_AnalogInfo = z.infer<typeof hmkAnalogInfoSchema>

export const hmkAnalogScanConfigSchema = z.object({
  muxSampleDelayUs: uint16Schema,
})

export type HMK_AnalogScanConfig = z.infer<
  typeof hmkAnalogScanConfigSchema
>

export const hmkAnalogScanDiagnosticsSchema = z.object({
  muxSampleDelayUs: uint16Schema,
  muxStepCount: uint16Schema,
  scanCount: uint32Schema,
  lastScanCycles: uint32Schema,
  maxScanCycles: uint32Schema,
  lastScanUs: uint32Schema,
  maxScanUs: uint32Schema,
  estimatedScanHz: uint32Schema,
  badChannelIdCount: uint32Schema,
  dmaOverrunCount: uint32Schema,
  overrunCount: uint32Schema,
  spiErrorCount: uint32Schema,
  missedScanCount: uint32Schema,
})

export type HMK_AnalogScanDiagnostics = z.infer<
  typeof hmkAnalogScanDiagnosticsSchema
>
