import { execFileSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { keyboardMetadataSchema } from "./metadata"

const workspaceRoot = path.resolve(
  fileURLToPath(new URL("../../../../", import.meta.url)),
)
const libhmkRoot = path.join(workspaceRoot, "libhmk")
const exportScript = path.join(libhmkRoot, "scripts/export_metadata_json.py")

export const interopFixturePath = fileURLToPath(
  new URL("./fixtures/libhmk-interoperability.json", import.meta.url),
)

export function loadLibhmkMetadata(args: string[]) {
  const output = execFileSync(
    process.env.PYTHON ?? "python3",
    [exportScript, ...args],
    {
      cwd: libhmkRoot,
      encoding: "utf8",
    },
  )

  return keyboardMetadataSchema.parse(JSON.parse(output))
}
