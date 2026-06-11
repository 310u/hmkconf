import { describe, expect, it, vi } from "vitest"
import {
  getAnalogScanConfig,
  getAnalogScanDiagnostics,
  resetAnalogScanDiagnostics,
  setAnalogScanConfig,
} from "./analog-scan"

describe("analog scan commands", () => {
  it("should read analog scan config from the response payload", async () => {
    const buffer = new ArrayBuffer(2)
    const view = new DataView(buffer)
    view.setUint16(0, 20, true)

    const mockCommander = {
      sendCommand: vi.fn().mockResolvedValue(view),
    } as any

    const config = await getAnalogScanConfig(mockCommander)

    expect(config).toEqual({ muxSampleDelayUs: 20 })
    expect(mockCommander.sendCommand).toHaveBeenCalledWith({
      command: expect.any(Number),
    })
  })

  it("should send analog scan delay as little-endian bytes", async () => {
    const mockCommander = {
      sendCommand: vi.fn().mockResolvedValue(undefined),
    } as any

    await setAnalogScanConfig(mockCommander, {
      data: { muxSampleDelayUs: 34 },
    })

    expect(mockCommander.sendCommand).toHaveBeenCalledWith({
      command: expect.any(Number),
      payload: [0x22, 0x00],
    })
  })

  it("should parse analog scan diagnostics from firmware response", async () => {
    const buffer = new ArrayBuffer(48)
    const view = new DataView(buffer)
    view.setUint16(0, 20, true)
    view.setUint16(2, 4, true)
    view.setUint32(4, 123, true)
    view.setUint32(8, 456, true)
    view.setUint32(12, 789, true)
    view.setUint32(16, 1000, true)
    view.setUint32(20, 2000, true)
    view.setUint32(24, 3000, true)
    view.setUint32(28, 4000, true)
    view.setUint32(32, 5, true)
    view.setUint32(36, 6, true)
    view.setUint32(40, 7, true)
    view.setUint32(44, 8, true)

    const mockCommander = {
      sendCommand: vi.fn().mockResolvedValue(view),
    } as any

    const diagnostics = await getAnalogScanDiagnostics(mockCommander)

    expect(diagnostics).toEqual({
      muxSampleDelayUs: 20,
      muxStepCount: 4,
      scanCount: 123,
      lastScanCycles: 456,
      maxScanCycles: 789,
      lastScanUs: 1000,
      maxScanUs: 2000,
      estimatedScanHz: 3000,
      badChannelIdCount: 4000,
      dmaOverrunCount: 5,
      overrunCount: 6,
      spiErrorCount: 7,
      missedScanCount: 8,
    })
  })

  it("should invoke reset analog scan diagnostics command", async () => {
    const mockCommander = {
      sendCommand: vi.fn().mockResolvedValue(undefined),
    } as any

    await resetAnalogScanDiagnostics(mockCommander)

    expect(mockCommander.sendCommand).toHaveBeenCalledWith({
      command: expect.any(Number),
    })
  })
})
