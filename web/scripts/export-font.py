"""Package the complete, unchanged PixelMplus font as WOFF 1.0 (stdlib only).

Specification: https://www.w3.org/TR/WOFF/
No glyph subsetting. The original sfnt table order and all table bytes are kept.
"""
import argparse
from pathlib import Path
import struct
import zlib

FONT_DIR = Path(__file__).resolve().parents[1] / 'src/assets/fonts'
SOURCE = FONT_DIR / 'PixelMplus12-Regular.ttf'
TARGET = FONT_DIR / 'PixelMplus12-Regular.woff'


def aligned(size):
    return (size + 3) & ~3


def checksum(data):
    return sum(value[0] for value in struct.iter_unpack('>I', data + bytes(aligned(len(data)) - len(data)))) & 0xffffffff


def encode(source):
    flavor, count = struct.unpack_from('>IH', source)
    entries = [struct.unpack_from('>4sIII', source, 12 + 16 * i) for i in range(count)]
    assert [tag for tag, *_ in entries] == sorted(tag for tag, *_ in entries)
    assert checksum(source) == 0xb1b0afba, 'invalid original sfnt checksum'
    offset = 44 + 20 * count
    blocks, directory = [], {}
    for tag, original_checksum, start, length in sorted(entries, key=lambda entry: entry[2]):
        data = source[start:start + length]
        assert len(data) == length
        checksum_data = data[:8] + bytes(4) + data[12:] if tag == b'head' else data
        assert checksum(checksum_data) == original_checksum
        compressed = zlib.compress(data, 9)
        stored = compressed if len(compressed) < length else data
        directory[tag] = struct.pack('>4sIIII', tag, offset, len(stored), length, original_checksum)
        blocks.append(stored + bytes(aligned(len(stored)) - len(stored)))
        offset += aligned(len(stored))
    sfnt_size = 12 + 16 * count + sum(aligned(length) for _, _, _, length in entries)
    header = struct.pack('>IIIHHIHHIIIII', 0x774f4646, flavor, offset, count, 0, sfnt_size, 1, 0, 0, 0, 0, 0, 0)
    return header + b''.join(directory[tag] for tag, *_ in entries) + b''.join(blocks)


def verify(source, woff):
    signature, flavor, length, count, reserved, sfnt_size, _, _, *extra = struct.unpack_from('>IIIHHIHHIIIII', woff)
    assert signature == 0x774f4646 and length == len(woff) and reserved == 0 and extra == [0] * 5
    assert (flavor, count) == struct.unpack_from('>IH', source)
    original = {tag: (crc, start, size) for tag, crc, start, size in (struct.unpack_from('>4sIII', source, 12 + 16 * i) for i in range(count))}
    assert sfnt_size == 12 + 16 * count + sum(aligned(size) for _, _, size in original.values())
    restored = bytearray(sfnt_size)
    restored[:12 + 16 * count] = source[:12 + 16 * count]
    next_offset = 44 + 20 * count
    records = [struct.unpack_from('>4sIIII', woff, 44 + 20 * i) for i in range(count)]
    assert [entry[0] for entry in records] == sorted(original)
    for tag, start, stored_size, original_size, crc in sorted(records, key=lambda entry: entry[1]):
        assert start == next_offset and start % 4 == 0 and 0 < stored_size <= original_size
        assert start + stored_size <= len(woff)
        stored = woff[start:start + stored_size]
        data = zlib.decompress(stored) if stored_size < original_size else stored
        expected_crc, original_start, expected_size = original[tag]
        assert (original_size, crc) == (expected_size, expected_crc)
        assert data == source[original_start:original_start + original_size], tag
        restored[original_start:original_start + original_size] = data
        next_offset += aligned(stored_size)
        assert not any(woff[start + stored_size:next_offset])
    assert next_offset == len(woff) and bytes(restored) == source
    glyphs = struct.unpack_from('>H', source, original[b'maxp'][1] + 4)[0]
    return glyphs


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='verify the committed WOFF without changing files')
    args = parser.parse_args()
    source = SOURCE.read_bytes()
    woff = TARGET.read_bytes() if args.check else encode(source)
    glyphs = verify(source, woff)
    if not args.check:
        TARGET.write_bytes(woff)
    print(f'Font: {len(source):,} → {len(woff):,} bytes; all {glyphs:,} glyphs and sfnt bytes preserved.')
