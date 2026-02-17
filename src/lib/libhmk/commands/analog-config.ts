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
import { DataViewWriter } from "$lib/data-view-writer"
import type { Commander } from "$lib/keyboard/commander"
import { HMK_Command } from "."

export enum HMK_AnalogFunction {
    None = 0,
    MouseX = 1,
    MouseY = 2,
    GamepadLX = 3,
    GamepadLY = 4,
    GamepadRX = 5,
    GamepadRY = 6,
    GamepadLTrig = 7,
    GamepadRTrig = 8,
}

export enum HMK_AnalogType {
    Centered = 0,
    Linear = 1,
}

export interface HMK_AnalogConfig {
    id: number
    function: HMK_AnalogFunction
    type: HMK_AnalogType
    inverted: boolean // mapped from uint8 (0 or 1)
    minValue: number
    centerValue: number
    maxValue: number
    deadzone: number
}

const ANALOG_CONFIG_SIZE = 9 // 1+1+1+1 + 2+2+2+2 = 12 bytes? Wait.
// uint8_t id;             // 1
// uint8_t function;       // 1
// uint8_t type;           // 1
// uint8_t inverted;       // 1
// uint16_t min_value;     // 2
// uint16_t center_value;  // 2
// uint16_t max_value;     // 2
// uint16_t deadzone;      // 2
// Total = 1+1+1+1 + 2+2+2+2 = 12 bytes.

export async function getAnalogConfig(
    commander: Commander,
    profile: number,
): Promise<HMK_AnalogConfig[]> {
    const NUM_ANALOG_CONFIGS = 4 // Matches firmware definition

    const reader = new DataViewReader(
        await commander.sendCommand({
            command: HMK_Command.GET_ANALOG_CONFIG, // Need to define this in index.ts
            payload: [profile, 0, 0], // profile, offset=0, len=0 (implies fetch?)
            // Firmware logic: offset=0, len=don't care for GET?
            // Wait, GET takes offset (p->offset). It returns from there.
            // firmware: memcpy(out, ..., M_MIN(...) * sizeof);
            // It fills the whole buffer. 
            // RAW_HID_EP_SIZE is usually 64. 4 * 12 = 48 bytes. It fits in one packet.
            // So detailed payload: [profile, offset]
        }),
    )

    // Actually command struct is:
    // uint8_t profile;
    // uint8_t offset;
    // uint8_t len;
    // analog_config_t analog_configs[4];

    // So for GET, we likely just send profile and offset.

    // Wait, let's verify `command_in_analog_config_t` in firmware:
    // uint8_t profile;
    // uint8_t offset; 
    // uint8_t len;
    // analog_config_t ...

    // And `command_out_buffer_t` has `analog_configs[4]`.

    // So we send [profile, offset=0, len=0 (unused for GET)]

    const ret: HMK_AnalogConfig[] = []

    for (let i = 0; i < NUM_ANALOG_CONFIGS; i++) {
        ret.push({
            id: reader.uint8(),
            function: reader.uint8(),
            type: reader.uint8(),
            inverted: reader.uint8() !== 0,
            minValue: reader.uint16(),
            centerValue: reader.uint16(),
            maxValue: reader.uint16(),
            deadzone: reader.uint16(),
        })
    }

    return ret
}

export async function setAnalogConfig(
    commander: Commander,
    profile: number,
    configs: HMK_AnalogConfig[],
): Promise<void> {
    // We write all 4 at once since they fit.
    const writer = new DataViewWriter()
    writer.uint8(profile)
    writer.uint8(0) // offset
    writer.uint8(configs.length) // len

    for (const config of configs) {
        writer.uint8(config.id)
        writer.uint8(config.function)
        writer.uint8(config.type)
        writer.uint8(config.inverted ? 1 : 0)
        writer.uint16(config.minValue)
        writer.uint16(config.centerValue)
        writer.uint16(config.maxValue)
        writer.uint16(config.deadzone)
    }

    await commander.sendCommand({
        command: HMK_Command.SET_ANALOG_CONFIG,
        payload: writer.dump(),
    })
}
