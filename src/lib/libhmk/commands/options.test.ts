import { describe, expect, it, vi } from "vitest"
import { getOptions, setOptions } from "./options"

describe("options commands", () => {
  it("should parse the full 32-bit options payload", async () => {
    const buffer = new ArrayBuffer(4)
    const view = new DataView(buffer)
    view.setUint32(0, 0x00021a0f, true)

    const mockCommander = {
      sendCommand: vi.fn().mockResolvedValue(view),
    } as any

    const options = await getOptions(mockCommander)

    expect(options).toEqual({
      xInputEnabled: true,
      saveBottomOutThreshold: true,
      highPollingRateEnabled: true,
      continuousCalibration: true,
      raw: 0x00021a0f,
    })
  })

  it("should preserve unknown option bits when updating toggles", async () => {
    const mockCommander = {
      sendCommand: vi.fn().mockResolvedValue(undefined),
    } as any

    await setOptions(mockCommander, {
      data: {
        xInputEnabled: false,
        saveBottomOutThreshold: true,
        highPollingRateEnabled: false,
        continuousCalibration: true,
        raw: 0x00021a0f,
      },
    })

    expect(mockCommander.sendCommand).toHaveBeenCalledWith({
      command: expect.any(Number),
      payload: [0x0a, 0x1a, 0x02, 0x00],
    })
  })
})
