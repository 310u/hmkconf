#!/usr/bin/env python3
"""Generate or apply Linux joydev correction overrides for selected axes.

Chromium/Electron on Linux reads the browser Gamepad API through joydev.
For HID gamepads with int8 logical axes, joydev often injects a default
deadzone (`flat`) that visibly distorts circular stick sweeps.

This helper preserves the current correction on every axis except the ones
you select, and rewrites those selected axes to a full-scale broken-line
mapping with a configurable deadzone.

Examples:
  python scripts/linux_joydev_correction.py --device /dev/input/js0 --axes 3 4
  python scripts/linux_joydev_correction.py --device /dev/input/js0 --axes 3 4 --apply
  python scripts/linux_joydev_correction.py --spec 'jscal -s 8,... /dev/input/js0' --axes 3 4
"""

from __future__ import annotations

import argparse
import dataclasses
import re
import shlex
import subprocess
import sys
from typing import Iterable


JSCAL_OUTPUT_MAX = 32767
JSCAL_SLOPE_SHIFT = 14
BROKEN_LINE_COEFFICIENTS = 4


@dataclasses.dataclass
class AxisCorrection:
    axis: int
    correction_type: int
    precision: int
    coefficients: list[int]


@dataclasses.dataclass
class CorrectionSpec:
    axes: list[AxisCorrection]
    device: str | None


def positive_int(value: str) -> int:
    parsed = int(value, 10)
    if parsed < 0:
        raise argparse.ArgumentTypeError("expected a non-negative integer")
    return parsed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument(
        "--device",
        help="joydev path such as /dev/input/js0; reads the current spec via jscal -p",
    )
    source.add_argument(
        "--spec",
        help="existing jscal correction command or raw correction payload",
    )
    parser.add_argument(
        "--axes",
        type=positive_int,
        nargs="+",
        required=True,
        help="axis numbers to rewrite, for example: --axes 3 4",
    )
    parser.add_argument(
        "--raw-min",
        type=int,
        default=-128,
        help="raw minimum reported by the selected axes before joydev correction",
    )
    parser.add_argument(
        "--raw-max",
        type=int,
        default=127,
        help="raw maximum reported by the selected axes before joydev correction",
    )
    parser.add_argument(
        "--center",
        type=int,
        default=0,
        help="raw rest center for the selected axes",
    )
    parser.add_argument(
        "--flat",
        type=positive_int,
        default=0,
        help="half-width of the desired deadzone in raw axis units",
    )
    parser.add_argument(
        "--precision",
        type=positive_int,
        default=None,
        help="precision field to write for selected axes; defaults to the current axis precision",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="run jscal -s with the generated correction instead of printing it only",
    )
    parser.add_argument(
        "--print-current",
        action="store_true",
        help="also print the current jscal -p output before the suggested replacement",
    )
    return parser.parse_args()


def read_current_spec(device: str) -> str:
    command = ["jscal", "-p", device]
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if not lines:
        raise ValueError(f"`{' '.join(command)}` returned no correction output")
    return lines[-1]


def parse_spec(text: str) -> CorrectionSpec:
    stripped = text.strip()
    if not stripped:
        raise ValueError("empty correction specification")

    payload = stripped
    device = None

    if stripped.startswith("jscal "):
        tokens = shlex.split(stripped)
        if len(tokens) < 4:
            raise ValueError(f"unexpected jscal command: {stripped!r}")
        try:
            option_index = next(
                index
                for index, token in enumerate(tokens)
                if token in {"-s", "--set-correction"}
            )
        except StopIteration as exc:
            raise ValueError(
                "expected a jscal command containing -s/--set-correction",
            ) from exc

        if option_index + 1 >= len(tokens):
            raise ValueError("missing correction payload after -s/--set-correction")

        payload = tokens[option_index + 1]
        if option_index + 2 < len(tokens):
            device = tokens[option_index + 2]
    elif re.fullmatch(r"[0-9,\- ]+", stripped):
        payload = stripped.replace(" ", "")
    else:
        raise ValueError(
            "expected either `jscal -s ... /dev/input/jsN` or a raw comma payload",
        )

    values = [int(part, 10) for part in payload.split(",") if part != ""]
    if not values:
        raise ValueError("correction payload did not contain any integers")

    axis_count = values[0]
    cursor = 1
    axes: list[AxisCorrection] = []

    for axis in range(axis_count):
        if cursor + 1 >= len(values):
            raise ValueError(f"payload ended while parsing axis {axis}")

        correction_type = values[cursor]
        precision = values[cursor + 1]
        cursor += 2

        coefficients: list[int] = []
        if correction_type == 1:
            end = cursor + BROKEN_LINE_COEFFICIENTS
            if end > len(values):
                raise ValueError(
                    f"payload ended while parsing broken-line coefficients for axis {axis}",
                )
            coefficients = values[cursor:end]
            cursor = end

        axes.append(
            AxisCorrection(
                axis=axis,
                correction_type=correction_type,
                precision=precision,
                coefficients=coefficients,
            ),
        )

    if cursor != len(values):
        raise ValueError("trailing integers remained after parsing the correction payload")

    return CorrectionSpec(axes=axes, device=device)


def serialize_spec(spec: CorrectionSpec) -> str:
    values: list[int] = [len(spec.axes)]
    for axis in spec.axes:
        values.extend([axis.correction_type, axis.precision])
        if axis.correction_type == 1:
            if len(axis.coefficients) != BROKEN_LINE_COEFFICIENTS:
                raise ValueError(
                    f"axis {axis.axis} expected {BROKEN_LINE_COEFFICIENTS} coefficients",
                )
            values.extend(axis.coefficients)
    return ",".join(str(value) for value in values)


def build_broken_line_axis(
    axis: int,
    raw_min: int,
    center: int,
    raw_max: int,
    flat: int,
    precision: int,
) -> AxisCorrection:
    lower_deadzone_edge = center - flat
    upper_deadzone_edge = center + flat

    if raw_min >= lower_deadzone_edge:
        raise ValueError(
            f"axis {axis}: raw minimum {raw_min} must be lower than lower deadzone edge {lower_deadzone_edge}",
        )
    if raw_max <= upper_deadzone_edge:
        raise ValueError(
            f"axis {axis}: raw maximum {raw_max} must be greater than upper deadzone edge {upper_deadzone_edge}",
        )

    negative_span = lower_deadzone_edge - raw_min
    positive_span = raw_max - upper_deadzone_edge

    negative_slope = (JSCAL_OUTPUT_MAX << JSCAL_SLOPE_SHIFT) // negative_span
    positive_slope = (JSCAL_OUTPUT_MAX << JSCAL_SLOPE_SHIFT) // positive_span

    return AxisCorrection(
        axis=axis,
        correction_type=1,
        precision=precision,
        coefficients=[
            lower_deadzone_edge,
            upper_deadzone_edge,
            negative_slope,
            positive_slope,
        ],
    )


def rewrite_selected_axes(
    spec: CorrectionSpec,
    axes_to_rewrite: Iterable[int],
    raw_min: int,
    center: int,
    raw_max: int,
    flat: int,
    precision_override: int | None,
) -> CorrectionSpec:
    selected = set(axes_to_rewrite)
    missing = sorted(index for index in selected if index < 0 or index >= len(spec.axes))
    if missing:
        raise ValueError(
            f"axis indexes out of range for a {len(spec.axes)}-axis device: {missing}",
        )

    rewritten_axes: list[AxisCorrection] = []
    for axis in spec.axes:
        if axis.axis not in selected:
            rewritten_axes.append(axis)
            continue

        rewritten_axes.append(
            build_broken_line_axis(
                axis=axis.axis,
                raw_min=raw_min,
                center=center,
                raw_max=raw_max,
                flat=flat,
                precision=axis.precision if precision_override is None else precision_override,
            ),
        )

    return CorrectionSpec(axes=rewritten_axes, device=spec.device)


def format_command(spec: CorrectionSpec, device_override: str | None = None) -> str:
    device = device_override or spec.device
    if not device:
        raise ValueError("a device path is required to format a runnable jscal command")
    return f"jscal -s {serialize_spec(spec)} {shlex.quote(device)}"


def main() -> int:
    args = parse_args()

    current_text = args.spec if args.spec is not None else read_current_spec(args.device)
    current_spec = parse_spec(current_text)
    device = args.device or current_spec.device
    if not device:
        raise ValueError("could not determine a joydev path; pass --device explicitly")

    updated_spec = rewrite_selected_axes(
        current_spec,
        axes_to_rewrite=args.axes,
        raw_min=args.raw_min,
        center=args.center,
        raw_max=args.raw_max,
        flat=args.flat,
        precision_override=args.precision,
    )

    current_command = format_command(current_spec, device)
    updated_command = format_command(updated_spec, device)

    if args.print_current:
        print("Current:")
        print(current_command)
        print()

    print("Suggested:")
    print(updated_command)
    print()
    print(
        "Persist on Debian-like systems after applying with: "
        f"sudo jscal-store {shlex.quote(device)}",
    )

    if args.apply:
        subprocess.run(shlex.split(updated_command), check=True)
        print()
        print("Applied.")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as exc:
        print(exc, file=sys.stderr)
        raise SystemExit(exc.returncode) from exc
    except Exception as exc:  # noqa: BLE001
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
