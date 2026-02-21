import { describe, it, expect, vi } from "vitest"
import { getAdvancedKeys, setAdvancedKeys, ADVANCED_KEY_SIZE } from "./advanced-keys"
import { HMK_AKType, type HMK_AdvancedKey } from "../advanced-keys"
import type { Commander } from "$lib/keyboard/commander"
import type { KeyboardMetadata } from "$lib/keyboard/metadata"

describe("advanced-keys commands", () => {
    const mockMetadata = {
        numAdvancedKeys: 1,
    } as KeyboardMetadata

    it("should get and parse COMBO advanced keys correctly", async () => {
        // 12 bytes total per advanced key
        const buffer = new ArrayBuffer(ADVANCED_KEY_SIZE)
        const view = new DataView(buffer)

        // Set layer, key, type
        view.setUint8(0, 1) // layer
        view.setUint8(1, 2) // key
        view.setUint8(2, HMK_AKType.COMBO) // type

        // Set combo data: keys (4 bytes), outputKeycode (1 byte), term (2 bytes) = 7 bytes
        view.setUint8(3, 10) // key 1
        view.setUint8(4, 11) // key 2
        view.setUint8(5, 255) // key 3
        view.setUint8(6, 255) // key 4
        view.setUint8(7, 0x04) // outputKeycode
        view.setUint16(8, 50, true) // term (little endian)

        const mockCommander = {
            sendCommand: vi.fn().mockResolvedValue(view)
        } as unknown as Commander

        const result = await getAdvancedKeys(mockCommander, mockMetadata, { profile: 0 })

        expect(mockCommander.sendCommand).toHaveBeenCalled()
        expect(result).toHaveLength(1)
        expect(result[0]).toEqual({
            layer: 1,
            key: 2,
            action: {
                type: HMK_AKType.COMBO,
                keys: [10, 11, 255, 255],
                outputKeycode: 0x04,
                term: 50,
            }
        })
    })

    it("should serialize COMBO advanced keys correctly", async () => {
        const mockCommander = {
            sendCommand: vi.fn().mockResolvedValue(new DataView(new ArrayBuffer(0)))
        } as unknown as Commander

        const comboKey: HMK_AdvancedKey = {
            layer: 1,
            key: 2,
            action: {
                type: HMK_AKType.COMBO,
                keys: [10, 11, 255, 255],
                outputKeycode: 0x04,
                term: 50,
            }
        }

        await setAdvancedKeys(mockCommander, { profile: 0, offset: 0, data: [comboKey] })

        expect(mockCommander.sendCommand).toHaveBeenCalled()

        // Find the payload passed to sendCommand
        const callArgs = vi.mocked(mockCommander.sendCommand).mock.calls[0][0] as any
        const payload = callArgs.payload as number[]

        // payload should be [profile, offset, count, ...data]
        expect(payload[0]).toBe(0) // profile
        expect(payload[1]).toBe(0) // offset
        expect(payload[2]).toBe(1) // count

        // The data part starts at index 3
        const dataPart = payload.slice(3)
        expect(dataPart).toHaveLength(ADVANCED_KEY_SIZE)

        expect(dataPart[0]).toBe(1) // layer
        expect(dataPart[1]).toBe(2) // key
        expect(dataPart[2]).toBe(HMK_AKType.COMBO) // type
        expect(dataPart[3]).toBe(10) // key 1
        expect(dataPart[4]).toBe(11) // key 2
        expect(dataPart[5]).toBe(255) // key 3
        expect(dataPart[6]).toBe(255) // key 4
        expect(dataPart[7]).toBe(0x04) // outputKeycode
        expect(dataPart[8]).toBe(50) // term (low byte)
        expect(dataPart[9]).toBe(0) // term (high byte)
        expect(dataPart[10]).toBe(0) // padding
        expect(dataPart[11]).toBe(0) // padding
    })
})
