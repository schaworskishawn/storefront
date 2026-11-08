"""Draws the start-up screen's spinner frames for Worldwide AI OS, as PNG files, with nothing but the standard library.

    make-splash.py <theme directory>

A ring turns once over the frames: its head is the brand's cyan and its tail fades into the brand's pink. The files are
named as Plymouth's two-step module looks for them (animation-NNNN.png and throbber-NNNN.png).
"""

import math
import struct
import sys
import zlib

SIZE = 64
FRAMES = 36
RADIUS = 23.0
THICKNESS = 5.0
CYAN = (0x69, 0xEB, 0xFF)
PINK = (0xF1, 0x79, 0xFB)
ARC = 1.55 * math.pi


def png(width: int, height: int, rgba: bytes) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    rows = b"".join(b"\x00" + rgba[y * width * 4 : (y + 1) * width * 4] for y in range(height))
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b"")


def frame(index: int) -> bytes:
    turn = 2 * math.pi * index / FRAMES
    centre = (SIZE - 1) / 2
    pixels = bytearray()
    for y in range(SIZE):
        for x in range(SIZE):
            dx, dy = x - centre, y - centre
            distance = math.hypot(dx, dy)
            # Coverage of the ring, softened over one pixel at each edge.
            edge = THICKNESS / 2 - abs(distance - RADIUS)
            coverage = max(0.0, min(1.0, edge + 0.5))
            # How far behind the head this point is, going backwards round the ring.
            behind = (turn - math.atan2(dy, dx)) % (2 * math.pi)
            if coverage == 0 or behind > ARC:
                pixels += b"\x00\x00\x00\x00"
                continue
            t = behind / ARC
            colour = [round(c + (p - c) * t) for c, p in zip(CYAN, PINK)]
            alpha = round(255 * coverage * (1 - t) ** 1.3)
            pixels += bytes(colour + [alpha])
    return png(SIZE, SIZE, bytes(pixels))


def main() -> None:
    target = sys.argv[1]
    for index in range(FRAMES):
        data = frame(index)
        for prefix in ("animation", "throbber"):
            with open(f"{target}/{prefix}-{index + 1:04d}.png", "wb") as handle:
                handle.write(data)
    print(f"Drew {FRAMES} spinner frames.")


main()
