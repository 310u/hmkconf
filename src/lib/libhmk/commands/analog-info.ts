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
import type { Commander } from "$lib/keyboard/commander"
import type { KeyboardMetadata } from "$lib/keyboard/metadata"
import { HMK_Command, type HMK_AnalogInfo } from "."

const ANALOG_INFO_MAX_ENTRIES = 21

export async function analogInfo(
  commander: Commander,
  { numKeys }: KeyboardMetadata,
): Promise<HMK_AnalogInfo[]> {
  const ret: HMK_AnalogInfo[] = []

  // 1. Standard Keys
  for (let i = 0; i < numKeys; i += ANALOG_INFO_MAX_ENTRIES) {
    const reader = new DataViewReader(
      await commander.sendCommand({
        command: HMK_Command.ANALOG_INFO,
        payload: [i],
      }),
    )

    for (let j = 0; j < ANALOG_INFO_MAX_ENTRIES && i + j < numKeys; j++) {
      ret[i + j] = {
        adcValue: reader.uint16(),
        distance: reader.uint8(),
      }
    }
  }

  // 2. Special Analog IDs (240-255)
  const SPECIAL_START = 240
  const SPECIAL_END = 255

  for (let i = SPECIAL_START; i <= SPECIAL_END; i += ANALOG_INFO_MAX_ENTRIES) {
    const reader = new DataViewReader(
      await commander.sendCommand({
        command: HMK_Command.ANALOG_INFO,
        payload: [i],
      }),
    )

    // Calculate how many entries we expect in this batch (handling boundary at 256)
    const entriesToRead = Math.min(ANALOG_INFO_MAX_ENTRIES, SPECIAL_END - i + 1);

    for (let j = 0; j < entriesToRead; j++) {
      ret[i + j] = {
        adcValue: reader.uint16(),
        distance: reader.uint8(),
      }
    }
  }

  return ret
}
