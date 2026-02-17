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

import { keyboardContext } from "$lib/keyboard"
import type { HMK_AnalogConfig } from "$lib/libhmk/commands/analog-config"
import { Context, resource, type ResourceReturn } from "runed"
import { profileQueryContext } from "./profile-query.svelte"

export class AnalogConfigQuery {
    analogConfigs: ResourceReturn<HMK_AnalogConfig[]>

    #keyboard = keyboardContext.get()
    #profileQuery = profileQueryContext.get()

    constructor() {
        this.analogConfigs = resource(
            () => this.#profileQuery.profile.current,
            async (profile) => {
                if (profile === undefined) return this.analogConfigs.current
                return await this.#keyboard.getAnalogConfig({ profile })
            },
            { lazy: true },
        )
    }

    async setAnalogConfigs(configs: HMK_AnalogConfig[]) {
        const profile = this.#profileQuery.profile.current
        if (profile === undefined) return

        try {
            await this.#keyboard.setAnalogConfig({ profile, data: configs })
            await this.analogConfigs.refetch()
        } catch (e) {
            console.error(e)
        }
    }
}

export const analogConfigQueryContext = new Context<AnalogConfigQuery>(
    "hmk-analog-config-query",
)
