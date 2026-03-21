import { describe, expect, it } from "vitest"
import {
  interopFixturePath,
  loadLibhmkMetadata,
} from "./libhmk-metadata-interop"

describe("libhmk metadata interoperability", () => {
  it("parses generated metadata for mochiko40he", () => {
    const parsed = loadLibhmkMetadata(["--keyboard", "mochiko40he"])

    expect(parsed.name).toBe("Mochiko40HE")
    expect(parsed.features.joystick).toBe(true)
    expect(parsed.features.encoder).toBe(false)
    expect(parsed.analogKeys).toEqual([...Array(41).keys()])
    expect(parsed.defaultKeymaps).toHaveLength(parsed.numProfiles)
  })

  it("parses generated metadata for encoder and digital fixture keyboards", () => {
    const parsed = loadLibhmkMetadata(["--keyboard-json", interopFixturePath])

    expect(parsed.features.encoder).toBe(true)
    expect(parsed.features.rgb).toBe(false)
    expect(parsed.features.joystick).toBe(false)
    expect(parsed.numKeys).toBe(6)
    expect(parsed.layout.keymap.flat().map(({ key }) => key)).toEqual([
      0, 1, 2, 3,
    ])
    expect(parsed.encoderKeys?.map(({ key }) => key)).toEqual([4, 5])
    expect(parsed.encoderKeys?.map(({ direction }) => direction)).toEqual([
      "cw",
      "ccw",
    ])
    expect(parsed.defaultKeymaps[0]?.[0]).toHaveLength(6)
  })
})
