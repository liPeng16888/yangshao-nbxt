#!/usr/bin/env python3
"""Generate deterministic Electron PNG, ICO and ICNS assets from approved art."""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

try:
    from PIL import Image
except ImportError as error:  # pragma: no cover - maintainer guidance
    raise SystemExit(
        "Pillow is required. Install it with: python3 -m pip install Pillow"
    ) from error


MASTER_SIZE = 1024
ART_SIZE = 896
ICO_SIZES = (16, 24, 32, 48, 64, 128, 256)


def remove_border_connected_black(image: Image.Image) -> tuple[Image.Image, int]:
    """Make only dark pixels connected to the source border transparent."""

    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    pending: deque[tuple[int, int]] = deque()
    visited = bytearray(width * height)

    def is_outer_black(x: int, y: int) -> bool:
        red, green, blue, alpha = pixels[x, y]
        return alpha > 0 and max(red, green, blue) < 160

    def enqueue(x: int, y: int) -> None:
        index = y * width + x
        if not visited[index] and is_outer_black(x, y):
            visited[index] = 1
            pending.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(height):
        enqueue(0, y)
        enqueue(width - 1, y)

    removed = 0
    while pending:
        x, y = pending.popleft()
        red, green, blue, _alpha = pixels[x, y]
        pixels[x, y] = (red, green, blue, 0)
        removed += 1
        if x > 0:
            enqueue(x - 1, y)
        if x + 1 < width:
            enqueue(x + 1, y)
        if y > 0:
            enqueue(x, y - 1)
        if y + 1 < height:
            enqueue(x, y + 1)

    return rgba, removed


def create_master(source_path: Path, target: str) -> tuple[Image.Image, int]:
    with Image.open(source_path) as source_image:
        source = source_image.convert("RGBA")

    removed = 0
    if target == "backend":
        source, removed = remove_border_connected_black(source)
        canvas = Image.new("RGBA", (MASTER_SIZE, MASTER_SIZE), (0, 0, 0, 0))
    else:
        canvas = Image.new(
            "RGBA", (MASTER_SIZE, MASTER_SIZE), (255, 255, 255, 255)
        )

    normalized = source.resize((ART_SIZE, ART_SIZE), Image.Resampling.LANCZOS)
    offset = (MASTER_SIZE - ART_SIZE) // 2
    canvas.alpha_composite(normalized, (offset, offset))
    return canvas, removed


def write_icns(master: Image.Image, destination: Path) -> None:
    master.save(destination, format="ICNS")


def generate_target(desktop_directory: Path, target: str) -> None:
    icon_directory = desktop_directory / "build" / "icons" / target
    source_path = icon_directory / "source.png"
    if not source_path.is_file():
        raise SystemExit(f"Missing approved source icon: {source_path}")

    master, removed = create_master(source_path, target)
    master.save(icon_directory / "icon.png", format="PNG", optimize=True)
    master.save(
        icon_directory / "icon.ico",
        format="ICO",
        sizes=[(size, size) for size in ICO_SIZES],
    )
    write_icns(master, icon_directory / "icon.icns")

    if target == "backend" and removed == 0:
        raise SystemExit("Backend icon did not contain border-connected black pixels")
    print(f"generated {target} icons (removed border pixels: {removed})")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--desktop-directory",
        type=Path,
        default=Path(__file__).resolve().parents[1],
    )
    arguments = parser.parse_args()

    for target in ("internal", "backend"):
        generate_target(arguments.desktop_directory.resolve(), target)


if __name__ == "__main__":
    main()
