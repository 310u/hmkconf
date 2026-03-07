import { keyboardContext, type SetMacrosParams } from "$lib/keyboard"
import type { HMK_Macro } from "$lib/libhmk/advanced-keys"
import { Context, resource, type ResourceReturn } from "runed"
import { optimisticUpdate } from "."
import { globalStateContext } from "../context.svelte"

export class MacrosQuery {
  macros: ResourceReturn<HMK_Macro[]>

  #keyboard = keyboardContext.get()
  #profile = $derived(globalStateContext.get().profile)

  constructor() {
    this.macros = resource(
      () => ({ profile: this.#profile }),
      (p) => this.#keyboard.getMacros(p),
    )
  }

  async set(params: Omit<SetMacrosParams, "profile">) {
    const { offset, data } = params
    await optimisticUpdate({
      resource: this.macros,
      optimisticFn: (current) => {
        const ret = [...current]
        for (let i = 0; i < data.length; i++) {
          ret[offset + i] = data[i]
        }
        return ret
      },
      updateFn: () =>
        this.#keyboard.setMacros({ ...params, profile: this.#profile }),
    })
  }
}

export const macrosQueryContext = new Context<MacrosQuery>("hmk-macros-query")
