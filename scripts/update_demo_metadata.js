import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const confPath = path.resolve(repoRoot, "src/lib/keyboard/metadata.ts")
let content = fs.readFileSync(confPath, "utf8")

const kbPath = path.resolve(
  repoRoot,
  "../libhmk/keyboards/mochiko40he/keyboard.json",
)
const kbJson = JSON.parse(fs.readFileSync(kbPath, "utf8"))

const DEMO_ENCODER_LAYER_KEYCODES = [
  ["KC_AUDIO_VOL_UP", "KC_AUDIO_VOL_DOWN"],
  ["KC_PGUP", "KC_PGDN"],
  ["KC_HOME", "KC_END"],
  ["KC_LEFT", "KC_RIGHT"],
]

const visibleNumKeys = kbJson.keyboard.num_keys
const baseEncoderMapArray = kbJson.encoder?.map || []
const useSyntheticDemoEncoder = baseEncoderMapArray.length === 0
const encoderMapArray = useSyntheticDemoEncoder
  ? [
      {
        label: "Demo Encoder",
        cw: visibleNumKeys,
        ccw: visibleNumKeys + 1,
      },
    ]
  : baseEncoderMapArray
const demoNumKeys = useSyntheticDemoEncoder
  ? visibleNumKeys + encoderMapArray.length * 2
  : visibleNumKeys

const baseKeymap = kbJson.keymap || []
const defaultKeymapArray = baseKeymap.map((layer, layerIndex) => {
  if (!Array.isArray(layer)) {
    throw new Error(`keymap layer ${layerIndex} is not an array`)
  }
  if (layer.length !== visibleNumKeys) {
    throw new Error(
      `keymap layer ${layerIndex} length ${layer.length} does not match keyboard.num_keys ${visibleNumKeys}`,
    )
  }

  if (!useSyntheticDemoEncoder) {
    return [...layer]
  }

  const encoderBindings =
    DEMO_ENCODER_LAYER_KEYCODES[layerIndex % DEMO_ENCODER_LAYER_KEYCODES.length]
  return [...layer, ...encoderBindings]
})
const defaultKeymapsJson = JSON.stringify(
  Array.from(
    { length: kbJson.keyboard.num_profiles },
    () => defaultKeymapArray,
  ),
  null,
  2,
)

// Generate demoMetadata block
const layoutJson = JSON.stringify(kbJson.layout, null, 2)

// Derive visible analog Hall-effect keys for the demo layout.
// The demo keeps the joystick switch visible, but encoder actions stay hidden.
const visibleLayoutKeys = kbJson.layout.keymap
  .flat()
  .map(({ key }) => key)
  .filter((key) => Number.isInteger(key))
const analogKeysArray = Array.from(new Set(visibleLayoutKeys))
  .filter((key) => key >= 0 && key < visibleNumKeys - 1)
  .sort((a, b) => a - b)
const analogKeysJson = JSON.stringify(analogKeysArray)
const encoderKeysArray = encoderMapArray.flatMap((encoder, encoderIndex) => {
  const label = encoder.label ?? `Encoder ${encoderIndex + 1}`
  return [
    {
      key: encoder.cw,
      encoder: encoderIndex,
      direction: "cw",
      label: `${label} Clockwise`,
    },
    {
      key: encoder.ccw,
      encoder: encoderIndex,
      direction: "ccw",
      label: `${label} Counterclockwise`,
    },
  ]
})
const encoderKeysJson = JSON.stringify(encoderKeysArray)

// Extract LED map
const ledMapArray = kbJson.rgb?.led_map || []
const ledMapJson = JSON.stringify(ledMapArray)
const modKeysArray = kbJson.rgb?.mod_keys || []
const numKeys = visibleNumKeys
const ledMapSet = new Set(ledMapArray)
for (const keyIndex of modKeysArray) {
  if (!Number.isInteger(keyIndex) || keyIndex < 0 || keyIndex >= numKeys) {
    throw new Error(`rgb.mod_keys contains out-of-range key index: ${keyIndex}`)
  }
  if (!ledMapSet.has(keyIndex)) {
    throw new Error(
      `rgb.mod_keys contains key index not present in rgb.led_map: ${keyIndex}`,
    )
  }
}
const modKeysSet = new Set(modKeysArray)
const modLedIndices = ledMapArray
  .map((keyIndex, ledIndex) => (modKeysSet.has(keyIndex) ? ledIndex : -1))
  .filter((v) => v >= 0)
const modLedIndicesJson = JSON.stringify(modLedIndices)

// Extract LED coordinates from rgb_coords.h
const coordsHeaderPath = path.resolve(
  repoRoot,
  "../libhmk/include/rgb_coords.h",
)
const coordsHeader = fs.readFileSync(coordsHeaderPath, "utf-8")
const ledCoords = []
const coordsBlockMatch = coordsHeader.match(
  /rgb_led_coords\s*\[[^\]]+\]\s*=\s*\{([\s\S]*?)\};/,
)
if (!coordsBlockMatch) {
  throw new Error("rgb_led_coords block not found in rgb_coords.h")
}
const coordsRegex = /\{(\d+),\s*(\d+)\}/g
let m
while ((m = coordsRegex.exec(coordsBlockMatch[1])) !== null) {
  ledCoords.push({ x: parseInt(m[1]), y: parseInt(m[2]) })
}
const ledCoordsJson = JSON.stringify(ledCoords)

const parseStart = content.indexOf(
  "export const demoMetadata = keyboardMetadataSchema.parse({",
)

if (parseStart !== -1) {
  let cursor = content.indexOf("{", parseStart)
  let depth = 0
  while (cursor < content.length) {
    const ch = content[cursor]
    if (ch === "{") depth += 1
    else if (ch === "}") depth -= 1
    if (depth === 0) break
    cursor += 1
  }
  const parseEnd = content.indexOf(")", cursor)
  if (parseEnd === -1) {
    throw new Error("Could not locate end of demoMetadata parse block")
  }

  const numProfiles = kbJson.keyboard.num_profiles || 4
  const numLayers = kbJson.keyboard.num_layers || 4
  const numAdvancedKeys = kbJson.keyboard.num_advanced_keys || 32
  const newBlock = `export const demoMetadata = keyboardMetadataSchema.parse({
  name: "Mochiko40HE Demo",
  vendorId: "0x0108",
  productId: "0x0111",
  usbHighSpeed: true,

  adcResolution: 12,
  numProfiles: ${numProfiles},
  numLayers: ${numLayers},
  numKeys: ${demoNumKeys},
  numAdvancedKeys: ${numAdvancedKeys},

  features: {
    rgb: ${kbJson.features?.rgb === true ? "true" : "false"},
    joystick: ${kbJson.features?.joystick === true ? "true" : "false"},
    encoder: ${encoderMapArray.length > 0 ? "true" : "false"},
  },

  layout: ${layoutJson},
  analogKeys: ${analogKeysJson},
  encoderKeys: ${encoderKeysJson},
  ledMap: ${ledMapJson},
  ledCoords: ${ledCoordsJson},
  modLedIndices: ${modLedIndicesJson},
  defaultKeymaps: ${defaultKeymapsJson},
})`
  content = `${content.slice(0, parseStart)}${newBlock}${content.slice(parseEnd + 1)}`
  fs.writeFileSync(confPath, content)
  console.log("Updated metadata.ts successfully!")
} else {
  console.log("Could not find demoMetadata in metadata.ts!")
}
