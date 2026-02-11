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
import type {
  GetAdvancedKeysParams,
  SetAdvancedKeysParams,
} from "$lib/keyboard"
import type { Commander } from "$lib/keyboard/commander"
import type { KeyboardMetadata } from "$lib/keyboard/metadata"
import { HMK_Command } from "."
import { HMK_AKType, type HMK_AdvancedKey } from "../advanced-keys"

export const ADVANCED_KEY_SIZE = 12
const GET_ADVANCED_KEYS_MAX_ENTRIES = 5

export async function getAdvancedKeys(
  commander: Commander,
  { numAdvancedKeys }: KeyboardMetadata,
  { profile }: GetAdvancedKeysParams,
) {
  const ret: HMK_AdvancedKey[] = []
  for (let i = 0; i < numAdvancedKeys; i += GET_ADVANCED_KEYS_MAX_ENTRIES) {
    const view = await commander.sendCommand({
      command: HMK_Command.GET_ADVANCED_KEYS,
      payload: [profile, i],
    })

    for (
      let j = 0;
      j < GET_ADVANCED_KEYS_MAX_ENTRIES && i + j < numAdvancedKeys;
      j++
    ) {
      const reader = new DataViewReader(view, j * ADVANCED_KEY_SIZE)
      const layer = reader.uint8()
      const key = reader.uint8()
      const type = reader.uint8()

      switch (type) {
        case HMK_AKType.NULL_BIND:
          ret.push({
            layer,
            key,
            action: {
              type,
              secondaryKey: reader.uint8(),
              behavior: reader.uint8(),
              bottomOutPoint: reader.uint8(),
            },
          })
          break
        case HMK_AKType.DYNAMIC_KEYSTROKE:
          ret.push({
            layer,
            key,
            action: {
              type,
              keycodes: [...Array(4)].map(() => reader.uint8()),
              bitmap: [...Array(4)].map(() => {
                const bitmapRaw = reader.uint8()
                return [...Array(4)].map((_, i) => (bitmapRaw >> (i * 2)) & 3)
              }),
              bottomOutPoint: reader.uint8(),
            },
          })
          break
        case HMK_AKType.TAP_HOLD:
          ret.push({
            layer,
            key,
            action: {
              type,
              tapKeycode: reader.uint8(),
              holdKeycode: reader.uint8(),
              tappingTerm: reader.uint16(),
              holdOnOtherKeyPress: reader.uint8() !== 0,
            },
          })
          break
        case HMK_AKType.TOGGLE:
          ret.push({
            layer,
            key,
            action: {
              type,
              keycode: reader.uint8(),
              tappingTerm: reader.uint16(),
            },
          })
          break
        case HMK_AKType.COMBO:
          ret.push({
            layer,
            key,
            action: {
              type,
              keys: [...Array(4)].map(() => reader.uint8()),
              keycode: reader.uint8(),
              term: reader.uint16(),
            },
          })
          break
        case HMK_AKType.NONE:
        default:
          ret.push({ layer, key, action: { type } })
          break
      }
    }
  }

  return ret
}

const SET_ADVANCED_KEYS_MAX_ENTRIES = 5

export async function setAdvancedKeys(
  commander: Commander,
  { profile, offset, data }: SetAdvancedKeysParams,
) {
  for (let i = 0; i < data.length; i += SET_ADVANCED_KEYS_MAX_ENTRIES) {
    const part = data.slice(i, i + SET_ADVANCED_KEYS_MAX_ENTRIES)
    const payload = [profile, offset + i, part.length]

    for (const { layer, key, action } of part) {
      const buffer = [layer, key, action.type]
      switch (action.type) {
        case HMK_AKType.NULL_BIND:
          buffer.push(
            action.secondaryKey,
            action.behavior,
            action.bottomOutPoint,
          )
          break
        case HMK_AKType.DYNAMIC_KEYSTROKE:
          buffer.push(
            ...action.keycodes,
            ...action.bitmap.map((bitmap) =>
              bitmap.reduce((acc, bit, i) => acc | (bit << (2 * i)), 0),
            ),
            action.bottomOutPoint,
          )
          break
        case HMK_AKType.TAP_HOLD:
          buffer.push(
            action.tapKeycode,
            action.holdKeycode,
            ...uint16ToUInt8s(action.tappingTerm),
            action.holdOnOtherKeyPress ? 1 : 0,
          )
          break
        case HMK_AKType.TOGGLE:
          buffer.push(action.keycode, ...uint16ToUInt8s(action.tappingTerm))
          break
        case HMK_AKType.COMBO:
          buffer.push(
            ...action.keys,
            action.keycode,
            ...uint16ToUInt8s(action.term),
          )
          break
        case HMK_AKType.NONE:
        default:
          break
      }
      buffer.push(...Array(ADVANCED_KEY_SIZE - buffer.length).fill(0))
      payload.push(...buffer)
    }

    await commander.sendCommand({
      command: HMK_Command.SET_ADVANCED_KEYS,
      payload,
    })
  }
}
