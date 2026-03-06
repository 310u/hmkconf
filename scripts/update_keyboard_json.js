import fs from 'fs';
import path from 'path';

const kbPath = path.resolve('../libhmk/keyboards/mochiko40he/keyboard.json');
let kbJson = JSON.parse(fs.readFileSync(kbPath, 'utf8'));

// 1. Update num_keys
kbJson.keyboard.num_keys = 41;

// 2. Add key 40 to layout.keymap
// Put it below the rest of the keys, say row 5
kbJson.layout.keymap.push([
    {
        "key": 40,
        "x": 4.5,
        "y": 4.5,
        "label": "STICK"
    }
]);

// 3. Add a placeholder keycode to the 4 keymap layers
const extraKeys = ["KC_MS_BTN1", "KC_TRNS", "KC_TRNS", "KC_TRNS"];
for (let i = 0; i < kbJson.keymap.length; i++) {
    kbJson.keymap[i].push(extraKeys[i]);
}

fs.writeFileSync(kbPath, JSON.stringify(kbJson, null, 4));
console.log("keyboard.json updated successfully for 41 keys!");
