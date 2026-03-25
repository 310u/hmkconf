#!/usr/bin/env python3
"""Measure Linux event-layer gamepad stick circularity.

This lets us compare browser Gamepad API observations against the kernel event
device directly on Linux.

Examples:
  python scripts/linux_gamepad_circularity.py --list
  python scripts/linux_gamepad_circularity.py --name Mochiko40HE --duration 6
  python scripts/linux_gamepad_circularity.py --device /dev/input/event258 --axes ABS_RX ABS_RY
  python scripts/linux_gamepad_circularity.py --source js --device /dev/input/js3 --axes 3 4
"""

from __future__ import annotations

import argparse
import array
import fcntl
import glob
import json
import math
import os
import select
import struct
import sys
import time
from dataclasses import asdict, dataclass
from itertools import combinations
from typing import Iterable

from evdev import AbsInfo, InputDevice, ecodes, list_devices


CIRCULAR_TARGET_MAGNITUDE = 127.0
MIN_OUTER_RADIUS = 24.0
OUTER_RADIUS_RATIO = 0.6
MIN_OUTER_SAMPLES = 16
MIN_ENVELOPE_SECTORS = 12
QUADRANT_THRESHOLD = 16.0
FULL_CIRCLE_RADIANS = math.pi * 2.0
RADIAL_BOUNDARY_SECTORS = 32
ANALOG_AXIS_CODES = (
    ecodes.ABS_X,
    ecodes.ABS_Y,
    ecodes.ABS_Z,
    ecodes.ABS_RX,
    ecodes.ABS_RY,
    ecodes.ABS_RZ,
)


@dataclass
class Point:
    x: float
    y: float


@dataclass
class CircularityReport:
    score: float
    label: str
    sampleCount: int
    outerSampleCount: int
    quadrantCoverage: int
    meanRadius: float
    radiusSpread: float
    axisRatio: float
    sufficient: bool


@dataclass
class AxisInfoRecord:
    value: int
    min: int
    max: int
    fuzz: int = 0
    flat: int = 0
    resolution: int = 0


JS_EVENT_BUTTON = 0x01
JS_EVENT_AXIS = 0x02
JS_EVENT_INIT = 0x80
JS_EVENT_STRUCT = struct.Struct("IhBB")
JSIOCGAXES = 0x80016A11
JSIOCGBUTTONS = 0x80016A12
JSIOCGNAME_BASE = 0x80006A13


def clamp(value: float, limits: tuple[float, float]) -> float:
    return max(limits[0], min(limits[1], value))


def axis_name(code: int) -> str:
    return ecodes.bytype[ecodes.EV_ABS].get(code, f"ABS_{code}")


def parse_axis_name(name: str) -> int:
    if name not in ecodes.ecodes:
        raise ValueError(f"unknown axis {name!r}")
    code = ecodes.ecodes[name]
    if not isinstance(code, int):
        raise ValueError(f"axis {name!r} did not resolve to a single code")
    return code


def vector_radius(point: Point) -> float:
    return math.hypot(point.x, point.y)


def normalize_angle(angle: float) -> float:
    return angle + FULL_CIRCLE_RADIANS if angle < 0 else angle


def sector_float(point: Point) -> float:
    return (
        normalize_angle(math.atan2(point.y, point.x)) * RADIAL_BOUNDARY_SECTORS
    ) / FULL_CIRCLE_RADIANS


def collect_radial_envelope(points: Iterable[Point]) -> tuple[list[float], list[bool], int]:
    boundaries = [0.0] * RADIAL_BOUNDARY_SECTORS
    seen = [False] * RADIAL_BOUNDARY_SECTORS

    for point in points:
        radius = vector_radius(point)
        if radius < MIN_OUTER_RADIUS:
            continue
        sector = int(round(sector_float(point))) % RADIAL_BOUNDARY_SECTORS
        boundaries[sector] = max(boundaries[sector], radius)
        seen[sector] = True

    return boundaries, seen, sum(1 for entry in seen if entry)


def fill_missing_radial_boundaries(boundaries: list[float], seen: list[bool]) -> list[float]:
    filled = list(boundaries)
    if not any(seen):
        return filled

    for index in range(len(filled)):
        if seen[index]:
            continue

        previous = index
        while not seen[previous]:
            previous = (previous - 1 + RADIAL_BOUNDARY_SECTORS) % RADIAL_BOUNDARY_SECTORS

        following = index
        while not seen[following]:
            following = (following + 1) % RADIAL_BOUNDARY_SECTORS

        previous_distance = (index - previous + RADIAL_BOUNDARY_SECTORS) % RADIAL_BOUNDARY_SECTORS
        following_distance = (following - index + RADIAL_BOUNDARY_SECTORS) % RADIAL_BOUNDARY_SECTORS
        total_distance = previous_distance + following_distance

        if total_distance == 0:
            filled[index] = filled[previous]
            continue

        previous_weight = following_distance / total_distance
        following_weight = previous_distance / total_distance
        filled[index] = (
            filled[previous] * previous_weight + filled[following] * following_weight
        )

    return filled


def envelope_axis_ratio(boundaries: list[float]) -> float:
    envelope_points = []
    for index, radius in enumerate(boundaries):
        angle = ((index + 0.5) * FULL_CIRCLE_RADIANS) / RADIAL_BOUNDARY_SECTORS
        envelope_points.append((math.cos(angle) * radius, math.sin(angle) * radius))

    xs = [point[0] for point in envelope_points]
    ys = [point[1] for point in envelope_points]
    x_range = max(xs) - min(xs)
    y_range = max(ys) - min(ys)
    longest_axis = max(x_range, y_range)
    return 0.0 if longest_axis == 0 else min(x_range, y_range) / longest_axis


def quadrant_coverage(points: Iterable[Point]) -> int:
    quadrants = 0
    for point in points:
        if abs(point.x) < QUADRANT_THRESHOLD or abs(point.y) < QUADRANT_THRESHOLD:
            continue
        if point.x >= 0 and point.y >= 0:
            quadrants |= 1 << 0
        if point.x < 0 <= point.y:
            quadrants |= 1 << 1
        if point.x < 0 and point.y < 0:
            quadrants |= 1 << 2
        if point.x >= 0 > point.y:
            quadrants |= 1 << 3
    return bin(quadrants).count("1")


def circularity_label(score: float, sufficient: bool) -> str:
    if not sufficient:
        return "Need More Sweep"
    if score >= 90:
        return "Excellent"
    if score >= 75:
        return "Good"
    if score >= 60:
        return "Fair"
    return "Poor"


def compute_circularity(points: list[Point]) -> CircularityReport:
    if not points:
        return CircularityReport(0, "Need More Sweep", 0, 0, 0, 0, 0, 0, False)

    radii = [vector_radius(point) for point in points]
    max_radius = max(radii)
    outer_radius_threshold = max(MIN_OUTER_RADIUS, max_radius * OUTER_RADIUS_RATIO)
    outer_points = [point for point in points if vector_radius(point) >= outer_radius_threshold]

    sample_count = len(points)
    outer_sample_count = len(outer_points)
    quadrants = quadrant_coverage(outer_points)
    boundaries, seen, seen_count = collect_radial_envelope(outer_points)

    if outer_sample_count == 0 or seen_count == 0:
        return CircularityReport(
            0,
            "Need More Sweep",
            sample_count,
            outer_sample_count,
            quadrants,
            0,
            0,
            0,
            False,
        )

    envelope_radii = fill_missing_radial_boundaries(boundaries, seen)
    mean_radius = sum(envelope_radii) / len(envelope_radii)
    min_radius = min(envelope_radii)
    max_radius = max(envelope_radii)
    radius_spread = 0 if mean_radius == 0 else (max_radius - min_radius) / mean_radius
    axis_ratio = envelope_axis_ratio(envelope_radii)
    sufficient = (
        outer_sample_count >= MIN_OUTER_SAMPLES
        and quadrants >= 3
        and seen_count >= MIN_ENVELOPE_SECTORS
    )
    score = clamp(
        100 - radius_spread * 180 - (1 - axis_ratio) * 80 - (4 - quadrants) * 10,
        (0, 100),
    )

    return CircularityReport(
        round(score, 2),
        circularity_label(score, sufficient),
        sample_count,
        outer_sample_count,
        quadrants,
        round(mean_radius, 2),
        round(radius_spread, 4),
        round(axis_ratio, 4),
        sufficient,
    )


def normalize_axis(value: int, info: AxisInfoRecord) -> float:
    center = round((info.min + info.max) / 2)
    distance_from_center = value - center
    if distance_from_center > 0:
        scale = max(1, info.max - center)
        return clamp((distance_from_center * 127) / scale, (-128, 127))
    scale = max(1, center - info.min)
    return clamp((distance_from_center * 128) / scale, (-128, 127))


def event_analog_axes(device: InputDevice) -> dict[int, AxisInfoRecord]:
    capabilities = device.capabilities(absinfo=True).get(ecodes.EV_ABS, [])
    return {
        code: AxisInfoRecord(
            value=int(info.value),
            min=int(info.min),
            max=int(info.max),
            fuzz=int(info.fuzz),
            flat=int(info.flat),
            resolution=int(info.resolution),
        )
        for code, info in capabilities
        if code in ANALOG_AXIS_CODES and info.min < info.max
    }


def axis_label(source: str, code: int) -> str:
    return axis_name(code) if source == "event" else f"AXIS_{code}"


def parse_js_axis(value: str) -> int:
    try:
        axis = int(value, 10)
    except ValueError as exc:
        raise ValueError(f"invalid js axis index {value!r}") from exc
    if axis < 0:
        raise ValueError(f"invalid js axis index {value!r}")
    return axis


def read_text(path: str) -> str | None:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return handle.read().strip()
    except OSError:
        return None


def js_sysfs_name(path: str) -> str | None:
    return read_text(f"/sys/class/input/{os.path.basename(path)}/device/name")


def js_sysfs_id(path: str, field: str) -> str | None:
    value = read_text(f"/sys/class/input/{os.path.basename(path)}/device/id/{field}")
    return f"0x{value}" if value else None


def open_js_device(path: str) -> int:
    return os.open(path, os.O_RDONLY | os.O_NONBLOCK)


def js_ioctl_u8(fd: int, request: int) -> int:
    buffer = array.array("B", [0])
    fcntl.ioctl(fd, request, buffer, True)
    return int(buffer[0])


def js_ioctl_name(fd: int, length: int = 128) -> str:
    buffer = array.array("B", [0] * length)
    fcntl.ioctl(fd, JSIOCGNAME_BASE + (0x10000 * len(buffer)), buffer, True)
    return buffer.tobytes().split(b"\x00", 1)[0].decode("utf-8", "replace")


def js_device_info(path: str) -> tuple[str, int, int]:
    fd = open_js_device(path)
    try:
        name = js_ioctl_name(fd) or js_sysfs_name(path) or "Unknown"
        axes = js_ioctl_u8(fd, JSIOCGAXES)
        buttons = js_ioctl_u8(fd, JSIOCGBUTTONS)
        return name, axes, buttons
    finally:
        os.close(fd)


def js_analog_axes(axis_count: int) -> dict[int, AxisInfoRecord]:
    return {
        index: AxisInfoRecord(value=0, min=-32767, max=32767)
        for index in range(axis_count)
    }


def list_event_devices() -> None:
    for path in list_devices():
        try:
            device = InputDevice(path)
        except PermissionError:
            print(f"{path}: permission denied")
            continue
        except OSError as exc:
            print(f"{path}: failed to open ({exc})")
            continue
        axes = event_analog_axes(device)
        print(f"{path}: {device.name}")
        print(
            f"  vendor=0x{device.info.vendor:04x} product=0x{device.info.product:04x} "
            f"version=0x{device.info.version:04x}"
        )
        if not axes:
            print("  analog axes: none")
            continue
        for code, info in sorted(axes.items()):
            print(
                f"  {axis_name(code)}: value={info.value} min={info.min} max={info.max} "
                f"fuzz={info.fuzz} flat={info.flat} resolution={info.resolution}"
            )


def list_js_devices() -> None:
    for path in sorted(glob.glob("/dev/input/js*")):
        try:
            name, axes, buttons = js_device_info(path)
        except PermissionError:
            print(f"{path}: permission denied")
            continue
        except OSError as exc:
            print(f"{path}: failed to open ({exc})")
            continue
        print(f"{path}: {name}")
        vendor = js_sysfs_id(path, "vendor")
        product = js_sysfs_id(path, "product")
        if vendor and product:
            print(f"  vendor={vendor} product={product}")
        print(f"  axes={axes} buttons={buttons}")


def select_event_device(args: argparse.Namespace) -> InputDevice:
    if args.device:
        try:
            return InputDevice(args.device)
        except PermissionError as exc:
            raise SystemExit(f"cannot open {args.device}: {exc}") from exc

    matches = []
    for path in list_devices():
        try:
            device = InputDevice(path)
        except PermissionError:
            continue
        except OSError:
            continue
        if args.name and args.name.lower() not in device.name.lower():
            continue
        if event_analog_axes(device):
            matches.append(device)

    if not matches:
        raise SystemExit("no matching input device found")
    if len(matches) > 1:
        names = ", ".join(f"{device.path}:{device.name}" for device in matches)
        raise SystemExit(f"multiple matching input devices found: {names}")
    return matches[0]


def select_js_device(args: argparse.Namespace) -> str:
    if args.device:
        if not os.path.exists(args.device):
            raise SystemExit(f"no such device: {args.device}")
        return args.device

    matches = []
    for path in sorted(glob.glob("/dev/input/js*")):
        name = js_sysfs_name(path)
        if args.name and (name is None or args.name.lower() not in name.lower()):
            continue
        matches.append(path)

    if not matches:
        raise SystemExit("no matching joystick device found")
    if len(matches) > 1:
        names = ", ".join(f"{path}:{js_sysfs_name(path) or 'Unknown'}" for path in matches)
        raise SystemExit(f"multiple matching joystick devices found: {names}")
    return matches[0]


def capture_snapshots_event(
    device: InputDevice,
    tracked_axes: dict[int, AxisInfoRecord],
    duration: float,
    delay: float,
) -> list[dict[int, int]]:
    if delay > 0:
        print(f"Sampling starts in {delay:.1f}s. Prepare to sweep now.", file=sys.stderr)
        time.sleep(delay)

    print(
        f"Sampling {device.path} for {duration:.1f}s on "
        + ", ".join(axis_name(code) for code in sorted(tracked_axes)),
        file=sys.stderr,
    )

    current = {code: info.value for code, info in tracked_axes.items()}
    snapshots: list[dict[int, int]] = []
    end_time = time.monotonic() + duration

    while True:
        remaining = end_time - time.monotonic()
        if remaining <= 0:
            break

        ready, _, _ = select.select([device.fd], [], [], min(remaining, 0.05))
        if not ready:
            continue

        for event in device.read():
            if event.type != ecodes.EV_ABS or event.code not in tracked_axes:
                continue
            current[event.code] = int(event.value)
            snapshots.append(dict(current))

    return snapshots


def read_js_events(fd: int) -> list[tuple[int, int, int, int]]:
    events = []
    while True:
        try:
            chunk = os.read(fd, JS_EVENT_STRUCT.size * 64)
        except BlockingIOError:
            break
        if not chunk:
            break
        usable = len(chunk) - (len(chunk) % JS_EVENT_STRUCT.size)
        for offset in range(0, usable, JS_EVENT_STRUCT.size):
            events.append(JS_EVENT_STRUCT.unpack(chunk[offset : offset + JS_EVENT_STRUCT.size]))
    return events


def capture_snapshots_js(
    path: str,
    tracked_axes: dict[int, AxisInfoRecord],
    duration: float,
    delay: float,
) -> list[dict[int, int]]:
    fd = open_js_device(path)
    try:
        if delay > 0:
            print(f"Sampling starts in {delay:.1f}s. Prepare to sweep now.", file=sys.stderr)
            time.sleep(delay)

        print(
            f"Sampling {path} for {duration:.1f}s on "
            + ", ".join(axis_label("js", code) for code in sorted(tracked_axes)),
            file=sys.stderr,
        )

        current = {code: info.value for code, info in tracked_axes.items()}
        snapshots: list[dict[int, int]] = []
        end_time = time.monotonic() + duration

        while True:
            remaining = end_time - time.monotonic()
            if remaining <= 0:
                break

            ready, _, _ = select.select([fd], [], [], min(remaining, 0.05))
            if not ready:
                continue

            for _, value, event_type, number in read_js_events(fd):
                if (event_type & ~JS_EVENT_INIT) != JS_EVENT_AXIS:
                    continue
                if number not in tracked_axes:
                    continue
                current[number] = int(value)
                snapshots.append(dict(current))

        return snapshots
    finally:
        os.close(fd)


def pair_points(
    snapshots: list[dict[int, int]],
    axis_x: int,
    axis_y: int,
    axis_info: dict[int, AxisInfoRecord],
) -> list[Point]:
    return [
        Point(
            normalize_axis(snapshot[axis_x], axis_info[axis_x]),
            normalize_axis(snapshot[axis_y], axis_info[axis_y]),
        )
        for snapshot in snapshots
    ]


def format_axis_info(info: AxisInfoRecord) -> dict[str, int]:
    return {
        "value": int(info.value),
        "min": int(info.min),
        "max": int(info.max),
        "fuzz": int(info.fuzz),
        "flat": int(info.flat),
        "resolution": int(info.resolution),
    }


def evaluate_pairs(
    source: str,
    snapshots: list[dict[int, int]],
    axis_info: dict[int, AxisInfoRecord],
    requested_axes: tuple[int, int] | None,
) -> list[dict[str, object]]:
    if requested_axes is not None:
        pairs = [requested_axes]
    else:
        pairs = list(combinations(sorted(axis_info), 2))

    results = []
    for axis_x, axis_y in pairs:
        points = pair_points(snapshots, axis_x, axis_y, axis_info)
        report = compute_circularity(points)
        results.append(
            {
                "axes": [axis_label(source, axis_x), axis_label(source, axis_y)],
                "codes": [axis_x, axis_y],
                "axisInfo": {
                    axis_label(source, axis_x): format_axis_info(axis_info[axis_x]),
                    axis_label(source, axis_y): format_axis_info(axis_info[axis_y]),
                },
                "circularity": asdict(report),
            }
        )

    results.sort(
        key=lambda entry: (
            entry["circularity"]["sufficient"],
            entry["circularity"]["score"],
            entry["circularity"]["outerSampleCount"],
        ),
        reverse=True,
    )
    return results


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        choices=("event", "js"),
        default="event",
        help="read from the Linux event device or joystick API device",
    )
    parser.add_argument("--list", action="store_true", help="list candidate Linux input devices")
    parser.add_argument("--device", help="read a specific /dev/input/event* or /dev/input/js* device")
    parser.add_argument("--name", help="match an input device by substring")
    parser.add_argument(
        "--axes",
        nargs=2,
        metavar=("AXIS_X", "AXIS_Y"),
        help="event source: ABS_RX ABS_RY, js source: numeric axis indices like 3 4",
    )
    parser.add_argument("--duration", type=float, default=6.0, help="sampling duration in seconds")
    parser.add_argument("--delay", type=float, default=1.5, help="delay before sampling begins")
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    return parser


def main() -> int:
    parser = build_argument_parser()
    args = parser.parse_args()

    if args.list:
        if args.source == "event":
            list_event_devices()
        else:
            list_js_devices()
        return 0

    requested_axes = None
    if args.source == "event":
        device = select_event_device(args)
        axis_info = event_analog_axes(device)
        if len(axis_info) < 2:
            raise SystemExit(f"{device.path} does not expose at least two analog axes")

        if args.axes:
            requested_axes = tuple(parse_axis_name(name) for name in args.axes)
            missing = [code for code in requested_axes if code not in axis_info]
            if missing:
                names = ", ".join(axis_name(code) for code in missing)
                raise SystemExit(f"{device.path} does not expose requested axes: {names}")

        tracked_axes = (
            {code: axis_info[code] for code in requested_axes}
            if requested_axes is not None
            else axis_info
        )
        snapshots = capture_snapshots_event(device, tracked_axes, args.duration, args.delay)
        device_payload = {
            "path": device.path,
            "name": device.name,
            "vendor": f"0x{device.info.vendor:04x}",
            "product": f"0x{device.info.product:04x}",
        }
    else:
        device_path = select_js_device(args)
        device_name, axis_count, button_count = js_device_info(device_path)
        axis_info = js_analog_axes(axis_count)
        if len(axis_info) < 2:
            raise SystemExit(f"{device_path} does not expose at least two joystick axes")

        if args.axes:
            requested_axes = tuple(parse_js_axis(name) for name in args.axes)
            missing = [code for code in requested_axes if code not in axis_info]
            if missing:
                names = ", ".join(str(code) for code in missing)
                raise SystemExit(f"{device_path} does not expose requested axes: {names}")

        tracked_axes = (
            {code: axis_info[code] for code in requested_axes}
            if requested_axes is not None
            else axis_info
        )
        snapshots = capture_snapshots_js(device_path, tracked_axes, args.duration, args.delay)
        device_payload = {
            "path": device_path,
            "name": device_name,
            "vendor": js_sysfs_id(device_path, "vendor"),
            "product": js_sysfs_id(device_path, "product"),
            "axes": axis_count,
            "buttons": button_count,
        }

    results = evaluate_pairs(args.source, snapshots, axis_info, requested_axes)
    payload = {
        "source": args.source,
        "device": device_payload,
        "samples": len(snapshots),
        "pairs": results,
        "bestPair": results[0] if results else None,
    }

    if args.json:
        print(json.dumps(payload, indent=2))
        return 0

    print(f"device: {device.path} ({device.name})")
    print(f"samples: {len(snapshots)}")
    for result in results:
        circularity = result["circularity"]
        print(
            f"{result['axes'][0]}/{result['axes'][1]}: "
            f"{circularity['score']:.2f} {circularity['label']} "
            f"(outer={circularity['outerSampleCount']}, "
            f"spread={circularity['radiusSpread']:.4f}, "
            f"axisRatio={circularity['axisRatio']:.4f})"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
