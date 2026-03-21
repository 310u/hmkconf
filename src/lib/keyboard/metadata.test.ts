import { describe, expect, it } from "vitest"
import { keyboardMetadataSchema } from "./metadata"

describe("keyboardMetadataSchema", () => {
  it("parses encoder metadata for hidden virtual keys", () => {
    const parsed = keyboardMetadataSchema.parse({
      name: "Encoder Test",
      vendorId: 0x0108,
      productId: 0x0111,
      adcResolution: 12,
      numProfiles: 1,
      numLayers: 2,
      numKeys: 4,
      numAdvancedKeys: 1,
      features: {
        encoder: true,
      },
      layout: {
        labels: [],
        keymap: [[{ key: 0 }, { key: 1 }]],
      },
      encoderKeys: [
        {
          key: 2,
          encoder: 0,
          direction: "cw",
          label: "Main Encoder Clockwise",
        },
        {
          key: 3,
          encoder: 0,
          direction: "ccw",
          label: "Main Encoder Counterclockwise",
        },
      ],
      defaultKeymaps: [
        [
          [0, 0, 0x87, 0x88],
          [0, 0, 0, 0],
        ],
      ],
    })

    expect(parsed.features.encoder).toBe(true)
    expect(parsed.encoderKeys?.map(({ key }) => key)).toEqual([2, 3])
    expect(parsed.encoderKeys?.[1]?.direction).toBe("ccw")
  })
})
