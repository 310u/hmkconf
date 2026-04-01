import { describe, expect, it, vi } from "vitest"
import { HMK_Command } from "."
import {
  getJoystickConfig,
  HMK_JOYSTICK_MOUSE_PRESET_FIRMWARE_VERSION,
  HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS,
  HMK_JOYSTICK_SCROLL_PROFILE_FIRMWARE_VERSION,
  HMK_JOYSTICK_SCROLL_PROFILE_LEGACY,
  HMK_JOYSTICK_SCROLL_PROFILE_SMOOTH,
  setJoystickConfig,
  type HMK_JoystickConfig,
} from "./joystick"

function dataViewFromBytes(bytes: number[]) {
  const view = new DataView(new ArrayBuffer(bytes.length))
  bytes.forEach((value, index) => view.setUint8(index, value))
  return view
}

function pushUint16(bytes: number[], value: number) {
  bytes.push(value & 0xff, (value >> 8) & 0xff)
}

function buildJoystickConfigResponse(params: {
  scrollProfile?: number
  firmwareVersion: number
}) {
  const { firmwareVersion, scrollProfile } = params
  const bytes: number[] = []

  pushUint16(bytes, 100)
  pushUint16(bytes, 200)
  pushUint16(bytes, 300)
  pushUint16(bytes, 400)
  pushUint16(bytes, 500)
  pushUint16(bytes, 600)

  bytes.push(15)
  bytes.push(4)
  bytes.push(12)
  bytes.push(180)
  bytes.push(7)

  if (firmwareVersion >= HMK_JOYSTICK_SCROLL_PROFILE_FIRMWARE_VERSION) {
    bytes.push(scrollProfile ?? HMK_JOYSTICK_SCROLL_PROFILE_LEGACY)
    bytes.push(0xaa, 0xbb)
  } else {
    bytes.push(0xaa, 0xbb, 0xcc)
  }

  bytes.push(
    ...Array.from(
      { length: HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS },
      (_, index) => 127 - (index % 3),
    ),
  )
  bytes.push(2)
  bytes.push(10, 100, 12, 180, 20, 220, 30, 255)

  return bytes
}

describe("joystick commands", () => {
  it("parses scrollProfile from modern firmware payloads", async () => {
    const mockCommander = {
      sendCommand: vi.fn().mockResolvedValue(
        dataViewFromBytes(
          buildJoystickConfigResponse({
            firmwareVersion: HMK_JOYSTICK_SCROLL_PROFILE_FIRMWARE_VERSION,
            scrollProfile: HMK_JOYSTICK_SCROLL_PROFILE_SMOOTH,
          }),
        ),
      ),
    } as any

    const config = await getJoystickConfig(
      mockCommander,
      { profile: 1 },
      HMK_JOYSTICK_SCROLL_PROFILE_FIRMWARE_VERSION,
    )

    expect(mockCommander.sendCommand).toHaveBeenCalledWith({
      command: HMK_Command.GET_JOYSTICK_CONFIG,
      payload: [1],
    })
    expect(config.scrollProfile).toBe(HMK_JOYSTICK_SCROLL_PROFILE_SMOOTH)
    expect(config.activeMousePreset).toBe(2)
    expect(config.mouseSpeed).toBe(20)
    expect(config.mouseAcceleration).toBe(220)
  })

  it("falls back to legacy scrollProfile for older firmware payloads", async () => {
    const mockCommander = {
      sendCommand: vi.fn().mockResolvedValue(
        dataViewFromBytes(
          buildJoystickConfigResponse({
            firmwareVersion: HMK_JOYSTICK_MOUSE_PRESET_FIRMWARE_VERSION,
          }),
        ),
      ),
    } as any

    const config = await getJoystickConfig(
      mockCommander,
      { profile: 0 },
      HMK_JOYSTICK_MOUSE_PRESET_FIRMWARE_VERSION,
    )

    expect(config.scrollProfile).toBe(HMK_JOYSTICK_SCROLL_PROFILE_LEGACY)
    expect(config.activeMousePreset).toBe(2)
  })

  it("serializes scrollProfile into the reserved joystick config slot", async () => {
    const mockCommander = {
      sendCommand: vi.fn().mockResolvedValue(new DataView(new ArrayBuffer(0))),
    } as any

    const config: HMK_JoystickConfig = {
      x: { min: 100, center: 200, max: 300 },
      y: { min: 400, center: 500, max: 600 },
      deadzone: 15,
      mode: 4,
      mouseSpeed: 20,
      mouseAcceleration: 220,
      swDebounceMs: 7,
      scrollProfile: HMK_JOYSTICK_SCROLL_PROFILE_SMOOTH,
      activeMousePreset: 2,
      mousePresets: [
        { mouseSpeed: 10, mouseAcceleration: 100 },
        { mouseSpeed: 12, mouseAcceleration: 180 },
        { mouseSpeed: 20, mouseAcceleration: 220 },
        { mouseSpeed: 30, mouseAcceleration: 255 },
      ],
      radialBoundaries: Array.from(
        { length: HMK_JOYSTICK_RADIAL_BOUNDARY_SECTORS },
        () => 127,
      ),
    }

    await setJoystickConfig(mockCommander, {
      profile: 3,
      config,
    })

    const payload = mockCommander.sendCommand.mock.calls[0][0]
      .payload as number[]
    expect(payload[0]).toBe(3)
    expect(payload[18]).toBe(HMK_JOYSTICK_SCROLL_PROFILE_SMOOTH)
    expect(payload[19]).toBe(0)
    expect(payload[20]).toBe(0)
  })
})
