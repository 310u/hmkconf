import { describe, expect, it, vi } from "vitest"
import { HMK_Command } from "."
import {
  getRgbConfig,
  HMK_RGB_BACKGROUND_COLOR_FIRMWARE_VERSION,
  setRgbConfig,
  type HMK_RgbConfig,
} from "./rgb"

function dataViewFromBytes(bytes: number[]) {
  const view = new DataView(new ArrayBuffer(bytes.length))
  bytes.forEach((value, index) => view.setUint8(index, value))
  return view
}

describe("rgb commands", () => {
  it("parses backgroundColor from the firmware payload", async () => {
    const responseBytes = [
      1,
      180,
      52,
      10,
      20,
      30,
      40,
      50,
      60,
      70,
      80,
      90,
      100,
      5,
      2,
      7,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
    ]

    const mockCommander = {
      sendCommand: vi.fn().mockResolvedValue(dataViewFromBytes(responseBytes)),
    } as any

    const result = await getRgbConfig(mockCommander, {
      profile: 2,
      numKeys: 0,
      numLayers: 0,
      firmwareVersion: HMK_RGB_BACKGROUND_COLOR_FIRMWARE_VERSION,
    })

    expect(mockCommander.sendCommand).toHaveBeenCalledWith({
      command: HMK_Command.GET_RGB_CONFIG,
      payload: [2, 0, 0],
    })
    expect(result.backgroundColor).toEqual({ r: 70, g: 80, b: 90 })
    expect(result.triggerStateColors).toEqual([
      { r: 1, g: 2, b: 3 },
      { r: 4, g: 5, b: 6 },
      { r: 7, g: 8, b: 9 },
      { r: 10, g: 11, b: 12 },
    ])
  })

  it("serializes backgroundColor before effect settings", async () => {
    const mockCommander = {
      sendCommand: vi.fn().mockResolvedValue(new DataView(new ArrayBuffer(0))),
    } as any

    const config: HMK_RgbConfig = {
      enabled: 1,
      globalBrightness: 180,
      currentEffect: 52,
      solidColor: { r: 10, g: 20, b: 30 },
      secondaryColor: { r: 40, g: 50, b: 60 },
      backgroundColor: { r: 70, g: 80, b: 90 },
      effectSpeed: 100,
      sleepTimeout: 5,
      layerIndicatorMode: 2,
      layerIndicatorKey: 7,
      layerColors: [],
      perKeyColors: [],
      triggerStateColors: [
        { r: 1, g: 2, b: 3 },
        { r: 4, g: 5, b: 6 },
        { r: 7, g: 8, b: 9 },
        { r: 10, g: 11, b: 12 },
      ],
    }

    await setRgbConfig(mockCommander, {
      profile: 1,
      numKeys: 0,
      numLayers: 0,
      firmwareVersion: HMK_RGB_BACKGROUND_COLOR_FIRMWARE_VERSION,
      data: config,
    })

    const call = mockCommander.sendCommand.mock.calls[0][0]
    expect(call.command).toBe(HMK_Command.SET_RGB_CONFIG)
    expect(call.payload[0]).toBe(1)
    expect(call.payload[1]).toBe(0)
    expect(call.payload[2]).toBe(28)
    expect(call.payload.slice(3, 19)).toEqual([
      1,
      180,
      52,
      10,
      20,
      30,
      40,
      50,
      60,
      70,
      80,
      90,
      100,
      5,
      2,
      7,
    ])
  })

  it("falls back to secondaryColor when backgroundColor is absent", async () => {
    const mockCommander = {
      sendCommand: vi.fn().mockResolvedValue(new DataView(new ArrayBuffer(0))),
    } as any

    await setRgbConfig(mockCommander, {
      profile: 0,
      numKeys: 0,
      numLayers: 0,
      firmwareVersion: HMK_RGB_BACKGROUND_COLOR_FIRMWARE_VERSION,
      data: {
        enabled: 1,
        globalBrightness: 255,
        currentEffect: 1,
        solidColor: { r: 9, g: 8, b: 7 },
        secondaryColor: { r: 6, g: 5, b: 4 },
        backgroundColor: { r: 6, g: 5, b: 4 },
        effectSpeed: 3,
        sleepTimeout: 2,
        layerIndicatorMode: 1,
        layerIndicatorKey: 0,
        layerColors: [],
        perKeyColors: [],
        triggerStateColors: [
          { r: 0, g: 0, b: 0 },
          { r: 0, g: 0, b: 0 },
          { r: 0, g: 0, b: 0 },
          { r: 0, g: 0, b: 0 },
        ],
      } as HMK_RgbConfig,
    })

    const payload = mockCommander.sendCommand.mock.calls[0][0].payload as number[]
    expect(payload.slice(12, 15)).toEqual([6, 5, 4])
  })

  it("parses legacy firmware payloads without backgroundColor", async () => {
    const responseBytes = [
      1,
      180,
      52,
      10,
      20,
      30,
      40,
      50,
      60,
      100,
      5,
      2,
      7,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
    ]

    const mockCommander = {
      sendCommand: vi.fn().mockResolvedValue(dataViewFromBytes(responseBytes)),
    } as any

    const result = await getRgbConfig(mockCommander, {
      profile: 2,
      numKeys: 0,
      numLayers: 0,
      firmwareVersion: HMK_RGB_BACKGROUND_COLOR_FIRMWARE_VERSION - 1,
    })

    expect(result.secondaryColor).toEqual({ r: 40, g: 50, b: 60 })
    expect(result.backgroundColor).toEqual({ r: 40, g: 50, b: 60 })
    expect(result.effectSpeed).toBe(100)
  })

  it("serializes legacy firmware payloads without backgroundColor bytes", async () => {
    const mockCommander = {
      sendCommand: vi.fn().mockResolvedValue(new DataView(new ArrayBuffer(0))),
    } as any

    await setRgbConfig(mockCommander, {
      profile: 1,
      numKeys: 0,
      numLayers: 0,
      firmwareVersion: HMK_RGB_BACKGROUND_COLOR_FIRMWARE_VERSION - 1,
      data: {
        enabled: 1,
        globalBrightness: 180,
        currentEffect: 52,
        solidColor: { r: 10, g: 20, b: 30 },
        secondaryColor: { r: 40, g: 50, b: 60 },
        backgroundColor: { r: 70, g: 80, b: 90 },
        effectSpeed: 100,
        sleepTimeout: 5,
        layerIndicatorMode: 2,
        layerIndicatorKey: 7,
        layerColors: [],
        perKeyColors: [],
        triggerStateColors: [
          { r: 1, g: 2, b: 3 },
          { r: 4, g: 5, b: 6 },
          { r: 7, g: 8, b: 9 },
          { r: 10, g: 11, b: 12 },
        ],
      },
    })

    const call = mockCommander.sendCommand.mock.calls[0][0]
    expect(call.command).toBe(HMK_Command.SET_RGB_CONFIG)
    expect(call.payload[2]).toBe(25)
    expect(call.payload.slice(3, 16)).toEqual([
      1,
      180,
      52,
      10,
      20,
      30,
      40,
      50,
      60,
      100,
      5,
      2,
      7,
    ])
  })
})
