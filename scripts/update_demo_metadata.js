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

// Generate demoMetadata block
const layoutJson = JSON.stringify(kbJson.layout, null, 2)

// Extract analog keys
const analogKeys = new Set()
if (kbJson.analog.mux && kbJson.analog.mux.matrix) {
  kbJson.analog.mux.matrix.flat().forEach((k) => analogKeys.add(k))
}
if (kbJson.analog.raw && kbJson.analog.raw.vector) {
  kbJson.analog.raw.vector.forEach((k) => analogKeys.add(k))
}
// Remove KC_NO (if 255 or 0 is used as placeholder, but usually they are valid indices)
// For mochiko40he, keys are 0-39 for analog. 40 is digital joystick sw.
const analogKeysArray = Array.from(analogKeys)
  .filter((k) => Number.isInteger(k) && k >= 0 && k < kbJson.keyboard.num_keys)
  .sort((a, b) => a - b)
const analogKeysJson = JSON.stringify(analogKeysArray)

// Extract LED map
const ledMapArray = kbJson.rgb?.led_map || []
const ledMapJson = JSON.stringify(ledMapArray)
const modKeysArray = kbJson.rgb?.mod_keys || []
const numKeys = kbJson.keyboard?.num_keys ?? 0
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
  name: "Mochiko40HE",
  vendorId: "0x0108",
  productId: "0x0111",
  usbHighSpeed: true,

  adcResolution: 12,
  numProfiles: ${numProfiles},
  numLayers: ${numLayers},
  numKeys: ${kbJson.keyboard.num_keys},
  numAdvancedKeys: ${numAdvancedKeys},

  features: {
    rgb: true,
    joystick: true,
  },

  layout: ${layoutJson},
  analogKeys: ${analogKeysJson},
  ledMap: ${ledMapJson},
  ledCoords: ${ledCoordsJson},
  modLedIndices: ${modLedIndicesJson},
  defaultKeymaps: [...Array(${numProfiles})].map(() => [...Array(${numLayers})].map(() => Array(${kbJson.keyboard.num_keys}).fill("KC_NO"))),
})`
  content = `${content.slice(0, parseStart)}${newBlock}${content.slice(parseEnd + 1)}`
  fs.writeFileSync(confPath, content)
  console.log("Updated metadata.ts successfully!")
} else {
  console.log("Could not find demoMetadata in metadata.ts!")
}
