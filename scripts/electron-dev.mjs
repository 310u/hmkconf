import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { createServer } from "vite"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const devServerUrl = process.env.HMKCONF_DEV_SERVER_URL ?? "http://127.0.0.1:5173"
const { hostname, port, protocol } = new URL(devServerUrl)
const targetPort = Number(port || (protocol === "https:" ? "443" : "80"))

if (protocol !== "http:" && protocol !== "https:") {
  throw new Error(`Unsupported dev server protocol: ${protocol}`)
}

let electron = null
let shuttingDown = false
const vite = await createServer({
  root: projectRoot,
  server: {
    host: hostname,
    port: targetPort,
    strictPort: true,
    open: false,
  },
})

await vite.listen()

function terminateChild(child, signal = "SIGTERM") {
  if (child !== null && !child.killed) {
    child.kill(signal)
  }
}

async function shutdown(code = 0, signal = "SIGTERM") {
  if (shuttingDown) return
  shuttingDown = true
  terminateChild(electron, signal)
  await vite.close()
  process.exit(code)
}

process.once("SIGINT", () => void shutdown(130, "SIGINT"))
process.once("SIGTERM", () => void shutdown(143))

try {
  electron = spawn("bun", ["run", "desktop:start"], {
    cwd: projectRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      HMKCONF_DEV_SERVER_URL: devServerUrl,
    },
  })

  electron.once("exit", (code) => {
    void shutdown(code ?? 0)
  })
} catch (err) {
  console.error(err)
  void shutdown(1)
}
