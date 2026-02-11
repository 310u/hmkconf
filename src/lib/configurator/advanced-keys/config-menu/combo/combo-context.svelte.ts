import { Context } from "runed"

export class ComboConfigMenuState {
    bindingSelected = $state(true)
}

export const comboConfigMenuStateContext = new Context<ComboConfigMenuState>(
    "ComboConfigMenuState",
)
