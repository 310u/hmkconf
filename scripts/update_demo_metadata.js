import fs from 'fs';
import path from 'path';

const confPath = path.resolve('../hmkconf/src/lib/keyboard/metadata.ts');
let content = fs.readFileSync(confPath, 'utf8');

const kbPath = path.resolve('../libhmk/keyboards/mochiko40he/keyboard.json');
const kbJson = JSON.parse(fs.readFileSync(kbPath, 'utf8'));

// Generate demoMetadata block
const layoutJson = JSON.stringify(kbJson.layout, null, 2);

const regex = /export const demoMetadata = keyboardMetadataSchema\.parse\(\{([\s\S]*?)\}\)/;
const match = content.match(regex);

if (match) {
  // Generate defaultKeymaps
  const numLayers = kbJson.keyboard.num_layers || 4;
  const defaultKeymapsStr = `defaultKeymaps: [...Array(4)].map(() => [...Array(${numLayers})].map(() => Array(${kbJson.keyboard.num_keys}).fill("KC_NO"))),`;

  const newBlock = `export const demoMetadata = keyboardMetadataSchema.parse({
  name: "Mochiko40HE",
  vendorId: "0x0108",
  productId: "0x0111",
  usbHighSpeed: true,

  adcResolution: 12,
  numProfiles: 4,
  numLayers: 4,
  numKeys: ${kbJson.keyboard.num_keys},
  numAdvancedKeys: 32,

  features: {
    rgb: true,
    joystick: true,
  },

  layout: ${layoutJson},
  defaultKeymaps: [...Array(4)].map(() => [...Array(4)].map(() => Array(${kbJson.keyboard.num_keys}).fill("KC_NO"))),
})`;
  content = content.replace(regex, newBlock);
  fs.writeFileSync(confPath, content);
  console.log("Updated metadata.ts successfully!");
} else {
  console.log("Could not find demoMetadata in metadata.ts!");
}
