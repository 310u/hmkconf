import { execFileSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { keyboardMetadataSchema } from "./metadata"

function findPythonExecutable() {
  const candidates = [process.env.PYTHON, process.env.PYTHON3, "python3", "python"]
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      execFileSync(candidate, ["--version"], {
        stdio: "ignore",
      })
      return candidate
    } catch {
      continue
    }
  }

  throw new Error(
    "Could not locate a Python executable. Set the PYTHON or PYTHON3 environment variable.",
  )
}

const workspaceRoot = (() => {
  try {
    return path.resolve(fileURLToPath(new URL("../../../../", import.meta.url)))
  } catch {
    return process.cwd()
  }
})()
const libhmkRoot = path.resolve(workspaceRoot, "..", "libhmk")
const exportScript = path.join(libhmkRoot, "scripts/export_metadata_json.py")

export const interopFixturePath = (() => {
  try {
    return fileURLToPath(
      new URL("./fixtures/libhmk-interoperability.json", import.meta.url),
    )
  } catch {
    return path.join(
      workspaceRoot,
      "src/lib/keyboard/fixtures/libhmk-interoperability.json",
    )
  }
})()

export function loadLibhmkMetadata(args: string[]) {
  const output = execFileSync(findPythonExecutable(), [exportScript, ...args], {
    cwd: libhmkRoot,
    encoding: "utf8",
  })

  return keyboardMetadataSchema.parse(JSON.parse(output))
}
