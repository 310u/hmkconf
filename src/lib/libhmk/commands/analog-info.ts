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
import { HMK_Command } from "."
import { z } from "zod"

export const hmkAnalogInfoSchema = z.object({
  adcValue: z.number().int().min(0).max(65535),
  distance: z.number().int().min(0).max(255),
})

export type HMK_AnalogInfo = z.infer<typeof hmkAnalogInfoSchema>

export async function analogInfo(
  commander: Commander,
  metadata: KeyboardMetadata,
): Promise<HMK_AnalogInfo[]> {
  const numKeys = metadata.numKeys
  const results: HMK_AnalogInfo[] = []

  for (let offset = 0; offset < numKeys; offset += 21) {
    const reader = new DataViewReader(
      await commander.sendCommand({
        command: HMK_Command.ANALOG_INFO,
        payload: [offset],
      }),
    )

    // 21 items in each payload batch
    const itemsToRead = Math.min(21, numKeys - offset)
    for (let i = 0; i < itemsToRead; i++) {
      const adcValue = reader.uint16()
      const distance = reader.uint8()
      results.push({ adcValue, distance })
    }
  }

  console.log("analogInfo fetched results:", results.length)
  return results
}
