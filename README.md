# hmkconf

Fork of [peppapighs/hmkconf](https://github.com/peppapighs/hmkconf) — The official web and desktop configurator for [libhmk](https://github.com/310u/libhmk) keyboards.

This configurator allows you to customize your Hall-effect keyboard's settings in real-time without needing to recompile or flash the firmware.

## Features

- **Real-time Configuration**: Instantly apply settings over raw HID with no recompilation or reflashing.
- **Desktop Application (Electron)**: Run `hmkconf` as a local desktop app while keeping the existing WebHID-based configurator logic.
- **Desktop Application (Tauri)** (Experimental): Legacy shell kept in-tree, but Electron is the practical desktop target right now.
- **Keymap Management**: Map standard keycodes, advanced macros, and combos across multiple layers.
- **Advanced Analog Settings**:
  - **Actuation Point**: Customize the exact travel distance required to actuate each key.
  - **Rapid Trigger (RT)**: Adjust the sensitivity for down-stroke and up-stroke separately.
  - **Continuous Rapid Trigger (CRT)**: Keep RT active until the key is fully released.
  - **Dynamic Keystroke (DKS)**: Map up to 4 actions at different points of a single keystroke.
  - **Null Bind (SOCD)**: Hardware-level SOCD resolution with various behaviors (Primary, Secondary, Neutral, Distance).
  - **Tap-Hold & Toggle**: Advanced modifier and layer toggling features.
- **Hardware Integrations (Fork additions)**:

  > [!WARNING]
  > Hardware features like **Joystick Support**, **Rotary Encoder Support**, and **RGB Lighting** are wired into the firmware and configurator, but are not yet fully tested on physical hardware. Slider support exists on the firmware side, but `hmkconf` does not yet have a dedicated slider tab.
  - **Analog RGB**: Select from 50+ animated, reactive, and static effects, including **Depth-Reactive** modes. Tweak speed, brightness, and set per-key colors.
  - **Joystick / Gamepad Mode**: Configure analog stick deadzones, calibration, mouse sensitivity, and XInput routing.
  - **Rotary Encoder Remap**: Configure per-layer clockwise and counterclockwise bindings when the firmware exposes encoder directions as virtual keys through `keyboard.json.encoder.map`.
  - **Macros & Combos**: Fully graphical interface for recording and editing macro sequences and multi-key combos.
  - **Bundled Demo Keyboard**: Use `/demo` to inspect the current configurator tabs, including RGB, joystick, and encoder flows, without attaching hardware.

- **EEPROM Storage**: Save calibrations and profiles directly to the keyboard's internal flash.

## Prerequisites

- [bun](https://bun.sh/) (JavaScript runtime and package manager)
- (For Tauri only) [Rust & Cargo](https://rustup.rs/)

## Getting Started (Web Version)

1. Install the dependencies:

```bash
bun install
```

2. Start the development server:

```bash
bun dev
```

Open [http://localhost:5173](http://localhost:5173) in a Chromium-based browser (Chrome, Edge, Brave) to use the WebHID connection.

## Demo Mode

For UI verification without hardware, open [http://localhost:5173/demo](http://localhost:5173/demo).

The bundled demo keyboard is a synthetic `Mochiko40HE Demo` profile that exposes the currently implemented configurator tabs in one place:

- RGB
- Joystick
- Rotary encoder remap
- Keymap / performance / advanced keys / gamepad / calibration

The demo encoder uses hidden virtual keys, matching the same `keyboard.json.encoder.map` model that real `libhmk` firmware uses for `hmkconf` remapping.

## Running the Desktop Application

The recommended desktop target is Electron because it ships Chromium and can use the same `navigator.hid` code path as the browser version.

1. Install the dependencies:

```bash
bun install
```

2. Run the desktop app in development mode:

```bash
bun run desktop:dev
```

3. Build the frontend and launch the static app locally inside Electron:

```bash
bun run desktop
```

`desktop:dev` starts Vite and Electron together. `desktop` loads the static `build/` output inside Electron.

If Linux/Wayland emits Chromium warnings on shutdown, you can force X11 for the desktop shell:

```bash
HMKCONF_LINUX_BACKEND=x11 bun run desktop:dev
```

## Building Desktop Packages

For local packaging, build on the target OS:

```bash
bun run desktop:dist:linux
bun run desktop:dist:win
bun run desktop:dist:mac
```

These commands write artifacts to `dist-electron/`.

- Linux: AppImage
- Windows: NSIS installer
- macOS: DMG

Windows and macOS builds are unsigned by default, so SmartScreen or Gatekeeper warnings are expected until you add signing.

## GitHub Actions Releases

[`release.yml`](./.github/workflows/release.yml) builds Linux, Windows, and macOS desktop packages on GitHub Actions.

- `workflow_dispatch`: builds all 3 OS packages and uploads them as workflow artifacts.
- `push` on `v*` tags: builds all 3 OS packages and publishes them to a GitHub Release.

## Tauri Status

The in-tree Tauri project is still experimental and is not the recommended distribution target right now.

1. Ensure dependencies are installed:

```bash
bun install
```

2. Run the desktop app in development mode:

```bash
bun tauri dev
```

3. Build the standalone executable for your OS:

```bash
bun tauri build
```

The compiled binaries will be located in the `src-tauri/target/release/bundle/` directory.

## Known Limitations

- **Electron Dependencies**: `desktop:dev` and `desktop` require the `electron` dev dependency to be installed locally with `bun install`.
- **Tauri Desktop App (Experimental)**: The current Tauri shell is still not a complete replacement for the browser/Electron path because it does not yet provide a native HID bridge.
- **Browser Support**: Safari and Firefox do not support WebHID natively. Use a Chromium-based browser or the Electron desktop app.
- **Slider UI**: Slider support exists in `libhmk`, but `hmkconf` does not yet provide a dedicated slider configuration screen.
- **Encoder Metadata Dependency**: The encoder tab only appears when firmware metadata exposes encoder directions as virtual keys.
- Background HID polling may occasionally fail or require a reconnect if the device is disconnected abruptly.

## Acknowledgements

- [peppapighs/hmkconf](https://github.com/peppapighs/hmkconf) — Original creator of hmkconf.
- Built with [SvelteKit](https://kit.svelte.dev/), [Electron](https://www.electronjs.org/), and [Tauri](https://tauri.app/).
