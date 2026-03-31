import { describe, expect, it, vi } from "vitest"
import { HMK_Command } from "."
import { setHostTime } from "./time"

describe("time commands", () => {
  it("sends the host time as a runtime-only command payload", async () => {
    const mockCommander = {
      sendCommand: vi.fn().mockResolvedValue(undefined),
    } as any

    await setHostTime(mockCommander, {
      hours: 12,
      minutes: 34,
      seconds: 56,
    })

    expect(mockCommander.sendCommand).toHaveBeenCalledWith({
      command: HMK_Command.SET_HOST_TIME,
      payload: [12, 34, 56],
    })
  })
})
