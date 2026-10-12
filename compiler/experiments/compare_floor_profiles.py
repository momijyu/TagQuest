"""Offline size comparison. Experimental bytes are NOT readable by the Web engine.

Run: python3 compiler/experiments/compare_floor_profiles.py
Production compiler/catalogs/sample files are never modified.
"""
import base64
import hashlib
import json
import random
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'compiler'))
import build as current

# Example immutable Web-side theme registry; stage instance IDs remain independent.
# Empty is supported in every theme. Forest includes the sample's sea boundary.
PROFILE_NAMES = {
    'castle': ['marble', 'carpet', 'wall-top', 'empty'],
    'town': ['grass', 'dirt', 'brick', 'water', 'bridge', 'empty'],
    'world': ['sea', 'sand', 'grass', 'bridge', 'forest-ground', 'world-mountain', 'world-forest', 'empty'],
    'forest': ['grass', 'dirt', 'forest-ground', 'sea', 'empty'],
    'cave': ['cave-floor', 'cave-wall', 'empty'],
    'demon-castle': ['demon-floor', 'demon-carpet', 'demon-wall-top', 'empty'],
}
PROFILES = [list(map(current.tile_id, names)) for names in PROFILE_NAMES.values()]
PROFILE_IDS = dict(zip(PROFILE_NAMES, range(len(PROFILES))))
CUSTOM = 255
CODECS = current.CODECS


class Bits:
    def __init__(self):
        self.values = []

    def add(self, value, width):
        assert 0 <= value < 1 << width
        self.values.extend((value >> bit) & 1 for bit in range(width - 1, -1, -1))

    def finish(self):
        values = self.values + [0] * (-len(self.values) % 8)
        return bytes(sum(values[i + j] << (7 - j) for j in range(8)) for i in range(0, len(values), 8))


class Reader:
    def __init__(self, data):
        self.data, self.offset = data, 0

    def take(self, width):
        if self.offset + width > len(self.data) * 8:
            raise ValueError('truncated bit stream')
        value = 0
        for _ in range(width):
            value = value << 1 | (self.data[self.offset // 8] >> (7 - self.offset % 8) & 1)
            self.offset += 1
        return value

    def end(self):
        remaining = len(self.data) * 8 - self.offset
        if remaining >= 8 or self.take(remaining):
            raise ValueError('unexpected trailing data')


def palette(stage, profile_id=None):
    if profile_id is not None:
        return PROFILES[profile_id], bytes([profile_id])
    ids = sorted({current.tile_id(stage['floor']['default']), *(current.tile_id(r['tile']) for r in stage['floor']['rectangles'])})
    if not 1 <= len(ids) <= 16:
        raise ValueError('custom palette must have 1..16 entries')
    return ids, bytes([CUSTOM, len(ids), *ids])


def encode(stage, codec, profile_id=None, variable=True):
    ids, prefix = palette(stage, profile_id)
    cells = current.encode_floor(stage)[0]
    local = [ids.index(tile) for tile in cells]
    width = max(1, (len(ids) - 1).bit_length()) if variable else 4
    bits = Bits()
    if codec == 'RAW':
        for tile in local:
            bits.add(tile, width)
    elif codec == 'RLE':
        i = 0
        while i < len(local):
            count = 1
            while i + count < len(local) and local[i + count] == local[i] and count < 16:
                count += 1
            bits.add(local[i], width)
            bits.add(count - 1, 4)
            i += count
    elif codec == 'RECT':
        rectangles = stage['floor']['rectangles']
        if len(rectangles) > 255:
            return None
        # Keep the original byte-aligned RECT layout for the ID-only control.
        bits.add(ids.index(current.tile_id(stage['floor']['default'])), width if variable else 8)
        bits.add(len(rectangles), 8)
        for rect in rectangles:
            bits.add(ids.index(current.tile_id(rect['tile'])), width)
            for value in (rect['x'], rect['y'], rect['width'] - 1, rect['height'] - 1):
                bits.add(value, 5)
    else:
        raise ValueError('unknown codec')
    return prefix + bits.finish()


def decode(data, codec, columns, rows, variable=True):
    if not data:
        raise ValueError('missing palette')
    if data[0] == CUSTOM:
        if len(data) < 2 or not 1 <= data[1] <= 16 or len(data) < data[1] + 2:
            raise ValueError('invalid custom palette')
        ids, offset = list(data[2:2 + data[1]]), 2 + data[1]
    elif data[0] < len(PROFILES):
        ids, offset = PROFILES[data[0]], 1
    else:
        raise ValueError('invalid theme')
    if len(set(ids)) != len(ids) or any(tile >= len(current.CATALOG['tiles']) for tile in ids):
        raise ValueError('invalid tile IDs')
    width = max(1, (len(ids) - 1).bit_length()) if variable else 4
    bits = Reader(data[offset:])
    total = columns * rows

    def tile(field_width=width):
        index = bits.take(field_width)
        if index >= len(ids):
            raise ValueError('tile outside palette')
        return ids[index]

    if codec == 'RAW':
        cells = [tile() for _ in range(total)]
    elif codec == 'RLE':
        cells = []
        while len(cells) < total:
            value, count = tile(), bits.take(4) + 1
            if len(cells) + count > total:
                raise ValueError('run outside floor')
            cells.extend([value] * count)
    elif codec == 'RECT':
        cells = [tile(width if variable else 8)] * total
        for _ in range(bits.take(8)):
            value = tile()
            x, y, w, h = bits.take(5), bits.take(5), bits.take(5) + 1, bits.take(5) + 1
            if x + w > columns or y + h > rows:
                raise ValueError('rectangle outside floor')
            for row in range(y, y + h):
                cells[row * columns + x:row * columns + x + w] = [value] * w
    else:
        raise ValueError('unknown codec')
    bits.end()
    return cells


def checked_candidates(stage, profile_id=None, variable=True):
    expected = current.encode_floor(stage)[0]
    result = []
    for codec in CODECS:
        data = encode(stage, codec, profile_id, variable)
        if data is not None:
            assert decode(data, codec, stage['width'], stage['height'], variable) == expected
            result.append((len(data), CODECS.index(codec), data))
    return result


def metrics(data):
    url = 'https://example.com/g#' + base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')
    return {'binary_bytes': len(data), 'url_bytes': len(url.encode()), 'ndef_tlv_bytes': current.ndef_size(url),
            'over_capacity_bytes': max(0, current.ndef_size(url) - 496)}


def compressed_metrics(data):
    compressor = zlib.compressobj(level=9, wbits=-15)
    packed = compressor.compress(data) + compressor.flush()
    assert zlib.decompress(packed, wbits=-15) == data
    # Hypothetical separate compression envelope: magic(2), version(1), codec(1).
    # All 4 bytes are included; this is not a URL supported by the current engine.
    return metrics(b'TZ\x01\x01' + packed)


def edge_checks():
    rng = random.Random(20261012)
    checks = 0
    # Odd cell counts, 1..16 types, runs longer than 16 and all rectangle bounds.
    for count in range(1, 17):
        names = list(dict.fromkeys(current.CATALOG['tiles'][current.tile_id(name)] for name in current.CATALOG['tiles']))[:count]
        for columns, rows in [(1, 1), (3, 5), (32, 32)]:
            stage = {'width': columns, 'height': rows, 'floor': {'default': names[0], 'rectangles': []}}
            for i, name in enumerate(names):
                stage['floor']['rectangles'].append({'tile': name, 'x': i % columns, 'y': i // columns % rows, 'width': 1, 'height': 1})
            for _ in range(12):
                x, y = rng.randrange(columns), rng.randrange(rows)
                stage['floor']['rectangles'].append({'tile': rng.choice(names), 'x': x, 'y': y,
                                                    'width': rng.randrange(1, columns - x + 1), 'height': rng.randrange(1, rows - y + 1)})
            checked_candidates(stage)
            checks += 3
    long = {'width': 32, 'height': 32, 'floor': {'default': 'grass', 'rectangles': []}}
    checked_candidates(long)
    many = {'width': 32, 'height': 32, 'floor': {'default': 'grass', 'rectangles': [
        {'tile': 'dirt', 'x': i % 32, 'y': i // 32, 'width': 1, 'height': 1} for i in range(256)]}}
    assert encode(many, 'RECT') is None
    assert len(checked_candidates(many)) == 2
    mixed = {'width': 3, 'height': 3, 'floor': {'default': 'marble', 'rectangles': [
        {'tile': 'grass', 'x': 1, 'y': 1, 'width': 1, 'height': 1}]}}
    checked_candidates(mixed)  # Castle plus foreign grass works through custom palette.
    sample = encode(mixed, 'RAW')
    for bad in (sample[:-1], sample + b'\x00', b'\xfe'):
        try:
            decode(bad, 'RAW', 3, 3)
        except ValueError:
            pass
        else:
            raise AssertionError('malformed prototype accepted')
    return checks + 3 + 2 + 3


def main():
    stages = json.loads((ROOT / 'art/adventure/world.json').read_text())['stages']
    baseline, reports = current.compile_game(stages, compact=True)
    assert baseline == (ROOT / 'art/adventure/world.bin').read_bytes()
    theme_keys = ['castle', 'town', 'world', 'forest', 'cave', 'demon-castle']
    assert len(stages) == len(theme_keys)
    result = {'scope': 'offline comparison only; no production decoder support',
              'source_sha256': hashlib.sha256(baseline).hexdigest(),
              'base_url': 'https://example.com/g', 'capacity_bytes': 496,
              'profiles': PROFILE_NAMES, 'baseline': metrics(baseline), 'variants': {}, 'stages': [],
              'compression_runtime': {'zlib_build': zlib.ZLIB_VERSION, 'zlib_runtime': zlib.ZLIB_RUNTIME_VERSION},
              'optional_deflate_with_4byte_envelope': {'baseline': compressed_metrics(baseline)}}
    variants = {name: bytearray(b'TQ' + bytes([240 + i, len(stages)])) for i, name in enumerate(
        ['theme_id_only', 'custom_variable_bits', 'theme_variable_bits', 'hybrid'])}
    for stage, report, theme_key in zip(stages, reports, theme_keys):
        original, _ = current.compile_stage(stage, version=baseline[2], compact=True, stage_ids=[s['id'] for s in stages] if baseline[2] >= 13 else None)
        old_floor_length = int.from_bytes(original[6:8], 'little')
        old_floor = original[9:9 + old_floor_length]
        untouched = original[9 + old_floor_length:]
        profile_id = PROFILE_IDS[theme_key]
        stored_ids, _ = palette(stage)
        assert set(stored_ids).issubset(PROFILES[profile_id])
        row = {'name': stage['name'], 'dimensions': [stage['width'], stage['height']],
               'actual_types': len(set(current.encode_floor(stage)[0])), 'profile_types': len(PROFILES[profile_id]),
               'theme_bits': max(1, (len(PROFILES[profile_id]) - 1).bit_length()),
               'baseline_floor_bytes': old_floor_length, 'baseline_stage_bytes': len(original), 'variants': {}}
        options = {
            'theme_id_only': checked_candidates(stage, profile_id, False),
            'custom_variable_bits': checked_candidates(stage),
            'theme_variable_bits': checked_candidates(stage, profile_id),
        }
        for name, candidates in options.items():
            size, codec, payload = min(candidates, key=lambda c: (c[0], c[1]))
            header = bytearray(original[:9])
            header[5] = header[5] & 64 | 32 | codec  # bit5=experimental floor; bit6=unchanged entity packing
            header[6:8] = size.to_bytes(2, 'little')
            data = bytes(header) + payload + untouched
            assert data[-len(untouched):] == untouched
            variants[name].extend(data)
            row['variants'][name] = {'floor_bytes': size, 'stage_bytes': len(data), 'codec': CODECS[codec],
                                     'codec_bytes': {CODECS[c]: length for length, c, _ in candidates}}
        # Optional practical form: preserve old mode wherever it is smaller.
        winner = min(['baseline', 'custom_variable_bits', 'theme_variable_bits'], key=lambda name: old_floor_length if name == 'baseline' else row['variants'][name]['floor_bytes'])
        if winner == 'baseline':
            hybrid_data = original
        else:
            size, codec, payload = min(options[winner], key=lambda c: (c[0], c[1]))
            header = bytearray(original[:9]); header[5] = header[5] & 64 | 32 | codec
            header[6:8] = size.to_bytes(2, 'little')
            hybrid_data = bytes(header) + payload + untouched
        variants['hybrid'].extend(hybrid_data)
        row['variants']['hybrid'] = {'floor_bytes': len(hybrid_data) - 9 - len(untouched),
                                    'stage_bytes': len(hybrid_data), 'source_mode': winner}
        result['stages'].append(row)
    for name, data in variants.items():
        result['variants'][name] = metrics(data)
        result['variants'][name]['saved_binary_bytes'] = len(baseline) - len(data)
        result['optional_deflate_with_4byte_envelope'][name] = compressed_metrics(data)
    result['checks'] = {'extra_codec_roundtrips': edge_checks(), 'sample_codec_roundtrips': 6 * 3 * 3,
                        'all_decoded_floor_cells_equal': True, 'all_nonfloor_stage_bytes_unchanged': True,
                        'baseline_matches_current_generated_binary': True}
    output = ROOT / 'docs/nfc-floor-profile-comparison-2026-10-12.json'
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: result[key] for key in ('baseline', 'variants', 'optional_deflate_with_4byte_envelope', 'checks')}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
