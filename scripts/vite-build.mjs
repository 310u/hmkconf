import { spawn, spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const electronBinary = path.join(
  projectRoot,
  "node_modules",
  "electron",
  "dist",
  process.platform === "win32" ? "electron.exe" : "electron",
)
const viteBinary = path.join(
  projectRoot,
  "node_modules",
  "vite",
  "bin",
  "vite.js",
)
const viteArgs = process.argv.slice(2)

if (viteArgs.length === 0) {
  viteArgs.push("build")
}

const nodeProbeCommand = process.platform === "win32" ? "where" : "which"
const hasSystemNode =
  spawnSync(nodeProbeCommand, ["node"], { stdio: "ignore" }).status === 0

const runtime = hasSystemNode
  ? { command: "node", env: {} }
  : process.versions.bun
    ? { command: process.execPath, env: {} }
    : { command: electronBinary, env: { ELECTRON_RUN_AS_NODE: "1" } }

const child = spawn(runtime.command, [viteBinary, ...viteArgs], {
  cwd: projectRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    ...runtime.env,
  },
})

child.once("error", (err) => {
  console.error(err)
  process.exit(1)
})

child.once("exit", (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})
