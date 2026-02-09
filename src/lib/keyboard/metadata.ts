/*
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later
 * version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { uint8Schema, uint16Schema } from "$lib/integer"
import {
  HMK_MAX_NUM_ADVANCED_KEYS,
  HMK_MAX_NUM_KEYS,
  HMK_MAX_NUM_LAYERS,
  HMK_MAX_NUM_PROFILES,
} from "$lib/libhmk"
import z from "zod"
import { Keycode, MO, PF } from "../libhmk/keycodes"

const uint16HexSchema = z.union([
  uint16Schema,
  z
    .string()
    .regex(/0x[0-9a-fA-F]{4}/)
    .transform((val) => parseInt(val, 16)),
])

const keycodeSchema = z.union([
  uint8Schema,
  z.string().transform((val, ctx) => {
    const moKeycode = val.match(/^MO\((\d+)\)$/)
    if (moKeycode) return MO(parseInt(moKeycode[1]))

    const pfKeycode = val.match(/^PF\((\d+)\)$/)
    if (pfKeycode) return PF(parseInt(pfKeycode[1]))

    if (!Object.keys(Keycode).includes(val)) {
      ctx.addIssue({
        code: "custom",
        message: `Unknown keycode: ${val}`,
        input: val,
      })
      return z.NEVER
    }

    return Keycode[val as keyof typeof Keycode]
  }),
])

const keyboardLayoutSchema = z
  .object({
    labels: z
      .array(z.union([z.string(), z.array(z.string()).min(3)]))
      .default([]),
    keymap: z.array(
      z.array(
        z.object({
          key: uint8Schema,
          w: z.number().min(1).default(1),
          h: z.number().min(1).default(1),
          x: z.number().default(0),
          y: z.number().default(0),
          option: z.tuple([z.int().min(0), z.int().min(0)]).optional(),
        }),
      ),
    ),
  })
  .superRefine((val, ctx) => {
    const optionMaxValues = val.labels.map((l) =>
      typeof l === "string" ? 2 : l.length - 1,
    )
    for (const { option } of val.keymap.flat()) {
      if (option === undefined) continue
      if (
        option[0] >= val.labels.length ||
        option[1] >= optionMaxValues[option[0]]
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Option key or value is out of range",
          input: option,
        })
      }
    }
  })

export type KeyboardLayout = z.infer<typeof keyboardLayoutSchema>

export const keyboardMetadataSchema = z
  .object({
    name: z.string(),
    vendorId: uint16HexSchema,
    productId: uint16HexSchema,
    usbHighSpeed: z.boolean().default(false),

    adcResolution: z.int().min(1).max(16),
    numProfiles: z.int().min(1).max(HMK_MAX_NUM_PROFILES),
    numLayers: z.int().min(1).max(HMK_MAX_NUM_LAYERS),
    numKeys: z.int().min(1).max(HMK_MAX_NUM_KEYS),
    numAdvancedKeys: z.int().min(1).max(HMK_MAX_NUM_ADVANCED_KEYS),

    layout: keyboardLayoutSchema,
    defaultKeymap: z.array(z.array(keycodeSchema)).optional(),
    defaultKeymaps: z.array(z.array(z.array(keycodeSchema))).optional(),
  })
  .transform((val, ctx) => {
    const getDefaultKeymaps = () => {
      const defaultKeymaps = val.defaultKeymaps
      if (defaultKeymaps !== undefined) {
        return defaultKeymaps
      } else {
        const defaultKeymap = val.defaultKeymap
        return defaultKeymap === undefined
          ? undefined
          : [...Array(val.numProfiles)].map(() =>
            defaultKeymap.map((layer) => [...layer]),
          )
      }
    }

    const defaultKeymaps = getDefaultKeymaps()
    if (defaultKeymaps === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Expected either defaultKeymap or defaultKeymaps",
      })
      return z.NEVER
    }

    if (defaultKeymaps.length !== val.numProfiles) {
      ctx.addIssue({
        code: "custom",
        message: `Expected defaultKeymaps to have ${val.numProfiles} profiles`,
      })
    }

    if (defaultKeymaps.some((profile) => profile.length !== val.numLayers)) {
      ctx.addIssue({
        code: "custom",
        message: `Expected defaultKeymaps profiles to have ${val.numLayers} layers`,
      })
    }

    if (
      defaultKeymaps.some((profile) =>
        profile.some((layer) => layer.length !== val.numKeys),
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: `Expected defaultKeymaps layers to have ${val.numKeys} keys`,
      })
    }

    return { ...val, defaultKeymaps }
  })

export type KeyboardMetadata = z.infer<typeof keyboardMetadataSchema>

export const demoMetadata = keyboardMetadataSchema.parse({
  name: "Mochiko39HE",
  vendorId: "0x0108",
  productId: "0x0110",
  usbHighSpeed: true,

  adcResolution: 12,
  numProfiles: 4,
  numLayers: 4,
  numKeys: 39,
  numAdvancedKeys: 32,

  layout: {
    labels: [
      "default"
    ],
    keymap: [
      [
        {
          "key": 0
        },
        {
          "key": 1
        },
        {
          "key": 2
        },
        {
          "key": 3
        },
        {
          "key": 4
        },
        {
          "key": 5,
          "x": 1.5
        },
        {
          "key": 6
        },
        {
          "key": 7
        },
        {
          "key": 8
        },
        {
          "key": 9
        }
      ],
      [
        {
          "key": 10
        },
        {
          "key": 11
        },
        {
          "key": 12
        },
        {
          "key": 13
        },
        {
          "key": 14
        },
        {
          "key": 15,
          "x": 0.25
        },
        {
          "key": 16,
          "x": 0.25
        },
        {
          "key": 17
        },
        {
          "key": 18
        },
        {
          "key": 19
        },
        {
          "key": 20
        }
      ],
      [
        {
          "key": 21
        },
        {
          "key": 22
        },
        {
          "key": 23
        },
        {
          "key": 24
        },
        {
          "key": 25
        },
        {
          "key": 26,
          "x": 1.5
        },
        {
          "key": 27
        },
        {
          "key": 28
        },
        {
          "key": 29
        },
        {
          "key": 30
        }
      ],
      [
        {
          "key": 31,
          "w": 1.25
        },
        {
          "key": 32,
          "w": 1.25
        },
        {
          "key": 33,
          "w": 2.25
        },
        {
          "key": 34
        },
        {
          "key": 35
        },
        {
          "key": 36,
          "w": 2.25
        },
        {
          "key": 37,
          "w": 1.25
        },
        {
          "key": 38,
          "w": 1.25
        }
      ]
    ]
  },
  defaultKeymaps: [...Array(4)].map(() => [
    [
      "KC_Q",
      "KC_W",
      "KC_E",
      "KC_R",
      "KC_T",
      "KC_Y",
      "KC_U",
      "KC_I",
      "KC_O",
      "KC_P",
      "KC_A",
      "KC_S",
      "KC_D",
      "KC_F",
      "KC_G",
      "KC_ESC",
      "KC_H",
      "KC_J",
      "KC_K",
      "KC_L",
      "KC_ENT",
      "KC_Z",
      "KC_X",
      "KC_C",
      "KC_V",
      "KC_B",
      "KC_N",
      "KC_M",
      "KC_COMM",
      "KC_DOT",
      "KC_SLSH",
      "KC_LGUI",
      "KC_LALT",
      "KC_SPC",
      "MO(1)",
      "MO(2)",
      "KC_BSPC",
      "KC_RALT",
      "KC_RCTL"
    ],
    [
      "KC_1",
      "KC_2",
      "KC_3",
      "KC_4",
      "KC_5",
      "KC_6",
      "KC_7",
      "KC_8",
      "KC_9",
      "KC_0",
      "KC_F1",
      "KC_F2",
      "KC_F3",
      "KC_F4",
      "KC_F5",
      "_______",
      "KC_F6",
      "KC_F7",
      "KC_F8",
      "KC_F9",
      "KC_QUOT",
      "KC_LSFT",
      "KC_MINS",
      "KC_EQL",
      "KC_BSLS",
      "KC_GRV",
      "KC_CAPS",
      "KC_F10",
      "KC_F11",
      "KC_F12",
      "KC_RSFT",
      "KC_LGUI",
      "KC_LALT",
      "KC_SPC",
      "KC_TAB",
      "MO(2)",
      "KC_BSPC",
      "KC_RALT",
      "KC_RCTL"
    ],
    [
      "KC_VOLD",
      "KC_HOME",
      "KC_UP",
      "KC_PGUP",
      "KC_VOLU",
      "KC_P7",
      "KC_P8",
      "KC_P9",
      "KC_PSLS",
      "KC_PAST",
      "_______",
      "KC_LEFT",
      "KC_DOWN",
      "KC_RIGHT",
      "KC_MUTE",
      "_______",
      "KC_P4",
      "KC_P5",
      "KC_P6",
      "KC_PMNS",
      "KC_PPLS",
      "_______",
      "KC_END",
      "KC_INS",
      "KC_PGDN",
      "KC_P0",
      "KC_P1",
      "KC_P2",
      "KC_P3",
      "KC_PDOT",
      "KC_EQL",
      "KC_LGUI",
      "KC_LALT",
      "KC_SPC",
      "MO(1)",
      "MO(2)",
      "KC_BSPC",
      "KC_RALT",
      "KC_RCTL"
    ],
    [
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______",
      "_______"
    ]
  ]),
})
