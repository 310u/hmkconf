import { spawn } from "node:child_process"
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const electronBinary = path.join(projectRoot, "node_modules", "electron", "dist", "electron")
const viteBinary = path.join(projectRoot, "node_modules", ".bin", "vite")
const nodeShimDir = mkdtempSync(path.join(tmpdir(), "hmkconf-node-"))
const nodeShimPath = path.join(nodeShimDir, "node")
const viteArgs = process.argv.slice(2)

writeFileSync(
  nodeShimPath,
  `#!/usr/bin/env bash
export ELECTRON_RUN_AS_NODE=1
exec "${electronBinary}" "$@"
`,
)
chmodSync(nodeShimPath, 0o755)

function cleanup() {
  rmSync(nodeShimDir, { force: true, recursive: true })
}

if (viteArgs.length === 0) {
  viteArgs.push("build")
}

const child = spawn(viteBinary, viteArgs, {
  cwd: projectRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    PATH: `${nodeShimDir}:${process.env.PATH ?? ""}`,
  },
})

child.once("error", (err) => {
  cleanup()
  console.error(err)
  process.exit(1)
})

child.once("exit", (code, signal) => {
  cleanup()

  if (signal !== null) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})
