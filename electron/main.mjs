import { app, BrowserWindow, net, protocol } from "electron"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, "..")
const buildDir = path.join(projectRoot, "build")
const appScheme = "hmkconf"
const appOrigin = `${appScheme}://app`
const linuxIconPath = path.join(projectRoot, "src-tauri", "icons", "128x128.png")
const devServerUrl = process.env.HMKCONF_DEV_SERVER_URL
const devServerOrigin = devServerUrl ? new URL(devServerUrl).origin : null
const linuxBackend = process.env.HMKCONF_LINUX_BACKEND

protocol.registerSchemesAsPrivileged([
  {
    scheme: appScheme,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

if (process.platform === "linux") {
  if (linuxBackend === "x11" || linuxBackend === "wayland") {
    app.commandLine.appendSwitch("ozone-platform", linuxBackend)
  } else {
    app.commandLine.appendSwitch("ozone-platform-hint", "auto")
  }
}

function isTrustedOrigin(origin) {
  if (!origin) return false
  if (origin.startsWith("file://")) return true
  if (origin.startsWith(appOrigin)) return true

  try {
    return devServerOrigin !== null && new URL(origin).origin === devServerOrigin
  } catch {
    return false
  }
}

function configureHidPermissions(session) {
  session.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    if (permission === "hid") {
      return isTrustedOrigin(requestingOrigin)
    }

    return false
  })

  session.setDevicePermissionHandler((details) => {
    return details.deviceType === "hid" && isTrustedOrigin(details.origin)
  })
}

async function resolveAppRequestPath(requestUrl) {
  const { pathname } = new URL(requestUrl)
  const normalizedPath = pathname === "/" ? "/index.html" : pathname
  const candidatePath = path.resolve(buildDir, `.${decodeURIComponent(normalizedPath)}`)

  if (!candidatePath.startsWith(buildDir)) {
    return path.join(buildDir, "index.html")
  }

  try {
    const stat = await fs.stat(candidatePath)
    if (stat.isDirectory()) {
      return path.join(candidatePath, "index.html")
    }
    return candidatePath
  } catch {
    return path.join(buildDir, "index.html")
  }
}

function registerAppProtocol() {
  protocol.handle(appScheme, async (request) => {
    const assetPath = await resolveAppRequestPath(request.url)
    return net.fetch(pathToFileURL(assetPath).toString())
  })
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: "hmkconf",
    backgroundColor: "#0b1016",
    autoHideMenuBar: true,
    icon: process.platform === "linux" ? linuxIconPath : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  configureHidPermissions(window.webContents.session)

  if (devServerUrl) {
    await window.loadURL(devServerUrl)
    return
  }

  await window.loadURL(`${appOrigin}/`)
}

app.whenReady().then(async () => {
  registerAppProtocol()
  await createWindow()

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
    }
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})
