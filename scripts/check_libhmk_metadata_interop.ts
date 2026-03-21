import {
  interopFixturePath,
  loadLibhmkMetadata,
} from "../src/lib/keyboard/libhmk-metadata-interop"

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

const mochiko40he = loadLibhmkMetadata(["--keyboard", "mochiko40he"])
assert(mochiko40he.name === "Mochiko40HE", "Expected Mochiko40HE metadata")
assert(
  mochiko40he.features.joystick,
  "Expected joystick feature for mochiko40he",
)
assert(
  !mochiko40he.features.encoder,
  "Did not expect encoder feature for mochiko40he",
)
assert(
  JSON.stringify(mochiko40he.analogKeys) === JSON.stringify([...Array(41).keys()]),
  "Expected analogKeys [0..40] for mochiko40he metadata",
)

const encoderFixture = loadLibhmkMetadata([
  "--keyboard-json",
  interopFixturePath,
])
assert(
  encoderFixture.features.encoder,
  "Expected encoder feature for fixture metadata",
)
assert(
  !encoderFixture.features.rgb,
  "Did not expect RGB feature for fixture metadata",
)
assert(
  !encoderFixture.features.joystick,
  "Did not expect joystick feature for fixture metadata",
)
assert(encoderFixture.numKeys === 6, "Expected 6 keys in fixture metadata")
assert(
  JSON.stringify(encoderFixture.encoderKeys?.map(({ key }) => key)) ===
    JSON.stringify([4, 5]),
  "Expected encoder virtual keys [4, 5]",
)

console.log("libhmk metadata interoperability checks passed")
