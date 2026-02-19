
import { Context } from "runed"

export class MacroConfigMenuState {
    selectedEventIndex: number | null = $state(null)
}

export const macroConfigMenuStateContext = new Context<MacroConfigMenuState>(
    "hmk-macro-config-menu-state",
)
