import type { HMK_Options } from "$lib/libhmk"
import {
  HOST_GAMEPAD_ACTIVE_THRESHOLD,
  type HostGamepadState,
} from "./joystick-host-gamepad"

export type FreshCapturePhase = "idle" | "armed" | "capturing" | "complete"

export function circularityTone(score: number, sufficient: boolean) {
  if (!sufficient) return "bg-muted text-muted-foreground"
  if (score >= 90) return "bg-emerald-500/15 text-emerald-700"
  if (score >= 75) return "bg-sky-500/15 text-sky-700"
  if (score >= 60) return "bg-amber-500/15 text-amber-700"
  return "bg-rose-500/15 text-rose-700"
}

export function detectLinuxHost(userAgent: string | null | undefined) {
  return !!userAgent && /Linux/i.test(userAgent)
}

export function getHostGamepadBackend(
  gamepadApiAvailable: boolean,
  isLinuxHost: boolean,
) {
  if (!gamepadApiAvailable) {
    return "Gamepad API unavailable"
  }

  if (isLinuxHost) {
    return "Chromium Gamepad API via Linux joydev"
  }

  return "Browser Gamepad API"
}

export function getCurrentGamepadTransport(options: HMK_Options | null) {
  if (!options) return "Unknown"
  return options.xInputEnabled ? "XInput" : "HID Gamepad"
}

export function supportsHostTransportComparison(
  navigatorAvailable: boolean,
  isLinuxHost: boolean,
) {
  return navigatorAvailable && !isLinuxHost
}

export function getGamepadHostValidationMode(
  mode: number | null | undefined,
  hostTransportComparisonSupported: boolean,
) {
  if (mode !== 2 && mode !== 3) {
    return hostTransportComparisonSupported
      ? "Switch the joystick mode to XInput Left Stick or XInput Right Stick before host-side gamepad checks."
      : "Switch the joystick mode to XInput Left Stick or XInput Right Stick before Linux browser host-side gamepad checks."
  }

  if (!hostTransportComparisonSupported) {
    return "On Linux, browser host checks read the Gamepad API through joydev. Use firmware OUT to validate the correction path, then treat the measured host capture as the real browser-side result. The Linux prediction shown below is only the default joydev baseline."
  }

  return "The joystick mode is already mapped to a gamepad stick, so host-side transport checks are ready."
}

export function getTransportValidationAdvice(
  hostTransportComparisonSupported: boolean,
) {
  if (!hostTransportComparisonSupported) {
    return "On Linux, Chromium/Electron reads Gamepad API axes through joydev instead of raw evdev/HID samples. Use firmware OUT to validate the correction path, then use measured host capture as the actual Linux browser result. The predicted Linux score is only a default-joydev reference."
  }

  return "After the shape is stable here, compare host behavior twice for gamepad use: once with XInput enabled, and once with XInput disabled."
}

export function getHostGamepadStatus(hostGamepadState: HostGamepadState) {
  if (!hostGamepadState.available) {
    return "Gamepad API is not available in this environment."
  }
  if (hostGamepadState.candidates.length === 0) {
    return "No host gamepad is currently detected. Disconnect other controllers if needed."
  }
  if (!hostGamepadState.sampledStick) {
    return "A host gamepad is connected, but the joystick mode is not set to a gamepad stick."
  }
  if (!hostGamepadState.axisPair) {
    return `Detected ${hostGamepadState.candidates.length} host gamepad(s), but the ${hostGamepadState.sampledStick} stick axis pair is still being inferred.`
  }
  if (hostGamepadState.magnitude < HOST_GAMEPAD_ACTIVE_THRESHOLD) {
    return `Detected ${hostGamepadState.candidates.length} host gamepad(s), but no activity was seen on the sampled ${hostGamepadState.sampledStick} stick yet.`
  }
  return `Sampling axes ${hostGamepadState.axisPair[0]}/${hostGamepadState.axisPair[1]} as the ${hostGamepadState.sampledStick} stick from host gamepad #${hostGamepadState.index}.`
}

export function getFreshCaptureStatus(
  freshCapturePhase: FreshCapturePhase,
  sampleCount: number,
) {
  if (freshCapturePhase === "armed") {
    return "Fresh capture is armed. Move the joystick to begin sampling."
  }
  if (freshCapturePhase === "capturing") {
    return `Capturing a fresh sweep: ${sampleCount} samples recorded.`
  }
  if (freshCapturePhase === "complete") {
    return `Fresh capture complete with ${sampleCount} joystick samples.`
  }
  return "No fresh sweep captured yet."
}

export function getHostCircularitySubtitle(
  hostTransportComparisonSupported: boolean,
) {
  if (!hostTransportComparisonSupported) {
    return "Measured Linux browser host result. Use this as the authoritative host-side score when it is available."
  }

  return "Confirms whether HID and XInput look different on the host."
}

export function getFreshHostSubtitle(
  hostTransportComparisonSupported: boolean,
) {
  if (!hostTransportComparisonSupported) {
    return "Measured Linux browser host score over the same fixed capture window."
  }

  return "Host score over the same fixed capture window."
}
