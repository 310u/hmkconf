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

import { DataViewReader } from "$lib/data-view-reader"
import { uint16ToUInt8s } from "$lib/integer"
import type { Commander } from "$lib/keyboard/commander"
import { HMK_Command } from "."
import type {
  HMK_AnalogScanConfig,
  HMK_AnalogScanDiagnostics,
} from "."

export type SetAnalogScanConfigParams = {
  data: HMK_AnalogScanConfig
}

export async function getAnalogScanConfig(
  commander: Commander,
): Promise<HMK_AnalogScanConfig> {
  const reader = new DataViewReader(
    await commander.sendCommand({ command: HMK_Command.GET_ANALOG_SCAN_CONFIG }),
  )

  return {
    muxSampleDelayUs: reader.uint16(),
  }
}

export async function setAnalogScanConfig(
  commander: Commander,
  { data }: SetAnalogScanConfigParams,
) {
  await commander.sendCommand({
    command: HMK_Command.SET_ANALOG_SCAN_CONFIG,
    payload: uint16ToUInt8s(data.muxSampleDelayUs),
  })
}

export async function getAnalogScanDiagnostics(
  commander: Commander,
): Promise<HMK_AnalogScanDiagnostics> {
  const reader = new DataViewReader(
    await commander.sendCommand({
      command: HMK_Command.GET_ANALOG_SCAN_DIAGNOSTICS,
    }),
  )

  return {
    muxSampleDelayUs: reader.uint16(),
    muxStepCount: reader.uint16(),
    scanCount: reader.uint32(),
    lastScanCycles: reader.uint32(),
    maxScanCycles: reader.uint32(),
    lastScanUs: reader.uint32(),
    maxScanUs: reader.uint32(),
    estimatedScanHz: reader.uint32(),
    badChannelIdCount: reader.uint32(),
    dmaOverrunCount: reader.uint32(),
    overrunCount: reader.uint32(),
    spiErrorCount: reader.uint32(),
    missedScanCount: reader.uint32(),
  }
}

export async function resetAnalogScanDiagnostics(commander: Commander) {
  await commander.sendCommand({
    command: HMK_Command.RESET_ANALOG_SCAN_DIAGNOSTICS,
  })
}
