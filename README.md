# hmkconf

Fork of [peppapighs/hmkconf](https://github.com/peppapighs/hmkconf) — The official web and desktop configurator for [libhmk](https://github.com/310u/libhmk) keyboards.

This configurator allows you to customize your Hall-effect keyboard's settings in real-time without needing to recompile or flash the firmware.

## Features

- **Real-time Configuration**: Instantly apply settings via WebUSB (no driver installation required).
- **Desktop Application (Tauri)** (Experimental): Run `hmkconf` as a native desktop application. _Note: WebUSB support in Tauri currently requires workarounds due to WebKit/Webview2 limitations._
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
  > Hardware features like **Joystick Support** and **RGB Lighting** have been implemented in the firmware and web UI but are not yet fully tested on physical hardware.
  - **Joystick / Gamepad Mode**: Configure analog stick deadzones, calibration, mouse sensitivity, and XInput routing.
  - **RGB Lighting**: Select from 50+ animated, reactive, and static effects, tweak speed/brightness, and set per-key colors.
  - **Macros & Combos**: Fully graphical interface for recording and editing macro sequences and multi-key combos.

- **EEPROM Storage**: Save calibrations and profiles directly to the keyboard's internal flash.

## Prerequisites

- [Node.js](https://nodejs.org/en/) (v18 or newer recommended)
- [bun](https://bun.sh/) (JavaScript runtime and package manager)
- (For Desktop App only) [Rust & Cargo](https://rustup.rs/)

## Getting Started (Web Version)

1. Install the dependencies:

```bash
bun install
```

2. Start the development server:

```bash
bun dev
```

Open [http://localhost:5173](http://localhost:5173) in a Chromium-based browser (Chrome, Edge, Brave) to use the WebUSB connection.

## Building the Desktop Application

The desktop application is built using [Tauri](https://tauri.app/), providing a native window without browser limitations.

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

- **Tauri Desktop App WebUSB Support**: Browsers embedded in Tauri (Webview2/WebKit) do not natively support the WebUSB API. Using the desktop app to connect to the keyboard may require running a local bridge server or implementing native Rust USB HID bindings (currently incomplete).
- Background USB polling via WebUSB may occasionally fail or require a page refresh if the device is disconnected abruptly.
- Safari and Firefox do not support WebUSB natively, so you must use the desktop app or a Chromium-based browser.

## Acknowledgements

- [peppapighs/hmkconf](https://github.com/peppapighs/hmkconf) — Original creator of hmkconf.
- Built with [SvelteKit](https://kit.svelte.dev/) and [Tauri](https://tauri.app/).
