import type { SetHostTimeParams } from "$lib/keyboard"
import type { Commander } from "$lib/keyboard/commander"
import { HMK_Command } from "."

export async function setHostTime(
  commander: Commander,
  { hours, minutes, seconds }: SetHostTimeParams,
) {
  await commander.sendCommand({
    command: HMK_Command.SET_HOST_TIME,
    payload: [hours, minutes, seconds],
  })
}
