"""Experimental TQ scene compiler (v8-v15 output). Python standard library only."""

import argparse
import base64
import json
import math
import re
import struct
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_CONFIG = json.loads((ROOT / 'web/src/data/public-config.json').read_text())
CATALOG = json.loads((ROOT / 'web/src/data/scene-catalog.json').read_text())
TILES = {name: index for index, name in enumerate(CATALOG['tiles'])}
WALL_FAMILIES = json.loads((ROOT / 'web/src/data/wall-families.json').read_text())
TILE_ALIASES = {name: kind for kind, names in WALL_FAMILIES.items() for name in names}
ENTITIES = {entry['name']: (index, entry['parameters']) for index, entry in enumerate(CATALOG['entities'])}
FRAMES = json.loads((ROOT / 'web/src/data/entity-frames.json').read_text())
BUILDING_OVERHANGS = json.loads((ROOT / 'web/src/data/building-overhangs.json').read_text())
CODECS = ('RAW', 'RLE', 'RECT')
RESIDENTS = ('traveler', 'resident', 'elder')
NPCS = ('king', 'weapon-merchant', 'armor-merchant', 'item-merchant', *RESIDENTS, 'cave-witch', 'forest-fairy', 'demon-lord', 'demon-guard', 'innkeeper', 'guild-master', 'sister', 'alchemist', 'unique-monster', 'blacksmith', 'shrine-keeper', 'casino-dealer', 'black-market-dealer', 'fortune-teller', 'captain', 'corral-keeper')
INSPECTABLE_OBJECTS = json.loads((ROOT / 'web/src/data/inspectable-objects.json').read_text())
DIALOGUES = json.loads((ROOT / 'web/src/data/dialogue-templates.json').read_text())
ITEMS = {item['id']: item for item in json.loads((ROOT / 'web/src/data/item-catalog.json').read_text())}
JS_WHITESPACE = '\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'
EXIT_DIRECTIONS = ('front', 'back', 'left', 'right')
ENEMY_CONFIG_DIR = ROOT / 'web/src/data/encounters'
ENEMY_NAMES = json.loads((ENEMY_CONFIG_DIR / 'enemy-catalog.json').read_text())
if not isinstance(ENEMY_NAMES, list) or any(not isinstance(name, str) or not re.fullmatch(r'[a-z0-9-]+', name) for name in ENEMY_NAMES):
    raise ValueError('invalid enemy config registry')
if len(set(ENEMY_NAMES)) != len(ENEMY_NAMES):
    raise ValueError('duplicate enemy config name')
ENEMY_DEFINITIONS = [json.loads((ENEMY_CONFIG_DIR / 'enemies' / f'{name}.json').read_text()) for name in ENEMY_NAMES]
ENEMIES = {entry['id']: entry for entry in ENEMY_DEFINITIONS}
if len(ENEMIES) != len(ENEMY_DEFINITIONS):
    raise ValueError('duplicate enemy ID')


def integer(value, low, high, label):
    if type(value) is not int or not low <= value <= high:
        raise ValueError(f'{label}: expected an integer from {low} to {high}')
    return value


def coordinate(value, extent, label):
    integer(value, 0, min(510, extent * 16 - 1), label)
    if value % 2:
        raise ValueError(f'{label}: coordinates must be multiples of 2px')
    return value // 2


def tile_id(name):
    if name not in TILES:
        raise ValueError(f'unknown tile: {name}')
    return TILES[TILE_ALIASES.get(name, name)]


def encode_interactions(entries):
    records = bytearray()
    count = 0
    for index, entry in enumerate(entries):
        kind = entry['kind']
        dialogue, item = entry.get('dialogue'), entry.get('itemId')
        if item is not None:
            integer(item, 0, 255, 'item id')
            if kind not in ['loot', *INSPECTABLE_OBJECTS] or item not in ITEMS:
                raise ValueError('item must target loot or an inspectable object and exist in the Web catalog')
        if dialogue is not None:
            if kind not in [*NPCS, *INSPECTABLE_OBJECTS] or not isinstance(dialogue, dict):
                raise ValueError('dialogue must target an NPC or an inspectable object')
            count += 1
            if dialogue.get('type') == 'template':
                template = integer(dialogue.get('id'), 0, min(255, len(DIALOGUES) - 1), 'dialogue template')
                records.extend([index, 0 if item is None else 3, template])
            elif dialogue.get('type') == 'custom':
                text = dialogue.get('text')
                if not isinstance(text, str) or not text.strip(JS_WHITESPACE) or re.search(r'[\x00-\x08\x0b-\x1f\x7f]', text):
                    raise ValueError('invalid dialogue text')
                encoded = text.encode('utf-8')
                integer(len(encoded), 1, 1024, 'dialogue UTF-8 bytes')
                records.extend([index, 1 if item is None else 4])
                records.extend(struct.pack('<H', len(encoded)))
                records.extend(encoded)
            else:
                raise ValueError('unknown dialogue type')
            if item is not None:
                records.append(item)
        elif item is not None:
            count += 1
            records.extend([index, 2, item])
    integer(len(records) + 1, 1, 65535, 'interaction payload bytes')
    return bytes([count]) + records if count else b''


def encode_battle_events(entries):
    records = bytearray()
    for i, entry in enumerate(entries):
        event = entry.get('battleEvent')
        if event is None:
            continue
        if entry['kind'] not in NPCS or not isinstance(event, dict):
            raise ValueError('battle event must target NPC')
        enemy_id = integer(event.get('enemyId'), 0, 255, 'battle enemy')
        once, clear = event.get('once'), event.get('clear')
        if enemy_id not in ENEMIES or type(once) is not bool or type(clear) is not bool or clear and not once:
            raise ValueError('invalid battle event')
        records.extend([i, enemy_id, int(once) | int(clear) << 1])
    return bytes([len(records) // 3]) + records


def compact_floor(stage):
    """Compare paint-order-safe merges and sweeps without changing the source JSON."""
    width = integer(stage['width'], 1, 32, 'width')
    height = integer(stage['height'], 1, 32, 'height')
    original = stage['floor']
    cells = [tile_id(original['default'])] * (width * height)
    integer(len(original['rectangles']), 0, 4096, 'rectangle count')
    for rect in original['rectangles']:
        tile = tile_id(rect['tile'])
        x = integer(rect['x'], 0, width - 1, 'rectangle x')
        y = integer(rect['y'], 0, height - 1, 'rectangle y')
        w = integer(rect['width'], 1, width - x, 'rectangle width')
        h = integer(rect['height'], 1, height - y, 'rectangle height')
        for row in range(y, y + h):
            cells[row * width + x:row * width + x + w] = [tile] * w
    def cost(floor):
        ids = {tile_id(floor['default']), *(tile_id(r['tile']) for r in floor['rectangles'])}
        local = any(i >= 16 for i in ids)
        return float('inf') if local and len(ids) > 16 else len(floor['rectangles']) * 3 + (len(ids) + 1 if local else 0)
    best, best_cost = original, cost(original)
    def consider(floor):
        nonlocal best, best_cost
        candidate_cost = cost(floor)
        if candidate_cost < best_cost:
            best, best_cost = floor, candidate_cost
    adjacent = []
    for source in original['rectangles']:
        r = dict(source)
        prev = adjacent[-1] if adjacent else None
        if prev and tile_id(prev['tile']) == tile_id(r['tile']) and prev['y'] == r['y'] and prev['height'] == r['height'] and (prev['x'] + prev['width'] == r['x'] or r['x'] + r['width'] == prev['x']):
            prev['x'] = min(prev['x'], r['x'])
            prev['width'] += r['width']
        elif prev and tile_id(prev['tile']) == tile_id(r['tile']) and prev['x'] == r['x'] and prev['width'] == r['width'] and (prev['y'] + prev['height'] == r['y'] or r['y'] + r['height'] == prev['y']):
            prev['y'] = min(prev['y'], r['y'])
            prev['height'] += r['height']
        else:
            adjacent.append(r)
    consider({'default': original['default'], 'rectangles': adjacent})
    for default_id in dict.fromkeys([tile_id(original['default']), *cells]):
        for vertical in (False, True):
            rectangles, previous = [], {}
            rows, columns = (width, height) if vertical else (height, width)
            def cell(row, col):
                return cells[col * width + row if vertical else row * width + col]
            for row in range(rows):
                current, col = {}, 0
                while col < columns:
                    tile, end = cell(row, col), col + 1
                    while end < columns and cell(row, end) == tile:
                        end += 1
                    if tile != default_id:
                        key = (tile, col, end)
                        earlier = previous.get(key)
                        rect = earlier if earlier is not None else {'tile': CATALOG['tiles'][tile], 'x': row if vertical else col, 'y': col if vertical else row, 'width': 0 if vertical else end - col, 'height': end - col if vertical else 0}
                        rect['width' if vertical else 'height'] += 1
                        if earlier is None:
                            rectangles.append(rect)
                        current[key] = rect
                    col = end
                previous = current
            consider({'default': CATALOG['tiles'][default_id], 'rectangles': rectangles})
    return best


def encode_floor(stage, optimize=False):
    if optimize:
        stage = {**stage, 'floor': compact_floor(stage)}
    width = integer(stage['width'], 1, 32, 'width')
    height = integer(stage['height'], 1, 32, 'height')
    global_default = tile_id(stage['floor']['default'])
    tile_ids = sorted({global_default, *(tile_id(rect['tile']) for rect in stage['floor']['rectangles'])})
    local_palette = any(tile >= 16 for tile in tile_ids)
    if local_palette and len(tile_ids) > 16:
        raise ValueError('a stage supports at most 16 distinct tile types')
    stored_id = lambda tile: tile_ids.index(tile) if local_palette else tile
    default = stored_id(global_default)
    cells = [default] * (width * height)
    commands = bytearray()
    rectangles = stage['floor']['rectangles']
    integer(len(rectangles), 0, 4096, 'rectangle count')
    for rect in rectangles:
        tile = stored_id(tile_id(rect['tile']))
        x = integer(rect['x'], 0, width - 1, 'rectangle x')
        y = integer(rect['y'], 0, height - 1, 'rectangle y')
        w = integer(rect['width'], 1, width - x, 'rectangle width')
        h = integer(rect['height'], 1, height - y, 'rectangle height')
        for row in range(y, y + h):
            cells[row * width + x:row * width + x + w] = [tile] * w
        packed = tile << 20 | x << 15 | y << 10 | (w - 1) << 5 | (h - 1)
        commands.extend(packed.to_bytes(3, 'big'))

    raw = bytes((cells[i] << 4) | (cells[i + 1] if i + 1 < len(cells) else 0)
                for i in range(0, len(cells), 2))
    rle = bytearray()
    i = 0
    while i < len(cells):
        length = 1
        while i + length < len(cells) and cells[i + length] == cells[i] and length < 16:
            length += 1
        rle.append(cells[i] << 4 | (length - 1))
        i += length
    # 編集用JSONには複雑な床も保存できる。RECTの個数上限を超えたらRAW/RLEを使う。
    rect = bytes([default, len(rectangles)]) + commands if len(rectangles) <= 255 else None
    prefix = bytes([len(tile_ids), *tile_ids]) if local_palette else b''
    global_cells = [tile_ids[tile] for tile in cells] if local_palette else cells
    return global_cells, tuple(prefix + data if data is not None else None for data in (raw, bytes(rle), rect)), local_palette


def encode_exits(stage, stage_ids=None):
    exits = stage.get('exits', [])
    if not isinstance(exits, list):
        raise ValueError('exits must be a list')
    integer(len(exits), 0, 255, 'exit count')
    result = bytearray([len(exits)])
    seen = set()
    packed_value, packed_bits = 0, 0
    target_bits = (len(stage_ids) - 1).bit_length() if stage_ids is not None else 8
    for entry in exits:
        if not isinstance(entry, dict):
            raise ValueError('invalid exit')
        x = integer(entry.get('x'), 0, stage['width'] - 1, 'exit x')
        y = integer(entry.get('y'), 0, stage['height'] - 1, 'exit y')
        if (x, y) in seen:
            raise ValueError('duplicate exit tile')
        seen.add((x, y))
        if entry.get('direction') not in EXIT_DIRECTIONS:
            raise ValueError('unknown arrival direction')
        target = integer(entry.get('targetStageId'), 0, 255, 'target stage')
        tx = integer(entry.get('targetX'), 0, 31, 'arrival x')
        ty = integer(entry.get('targetY'), 0, 31, 'arrival y')
        direction = EXIT_DIRECTIONS.index(entry['direction'])
        if stage_ids is None:
            result.extend([x, y, target, tx, ty, direction])
        else:
            if target not in stage_ids:
                raise ValueError('exit target missing')
            for value, bits in ((x, 5), (y, 5), (stage_ids.index(target), target_bits), (tx, 5), (ty, 5), (direction, 2)):
                packed_value = packed_value << bits | value
                packed_bits += bits
    if stage_ids is not None and packed_bits:
        padding = (-packed_bits) % 8
        result.extend((packed_value << padding).to_bytes((packed_bits + padding) // 8, 'big'))
    return bytes(result)


def encode_encounter(stage, version=15):
    if 'encounter' not in stage:
        return b'\x00'
    data = stage['encounter']
    if not isinstance(data, dict) or type(data.get('enabled')) is not bool:
        raise ValueError('invalid encounter settings')
    rate = data.get('rate')
    if type(rate) not in (int, float) or not math.isfinite(rate) or not 0 <= rate <= 100 or abs(rate * 100 - round(rate * 100)) > 1e-8:
        raise ValueError('encounter rate must be 0..100 in 0.01 percent steps')
    fractional = rate != int(rate)
    if fractional and version < 15:
        raise ValueError('fractional encounter rate requires v15')
    entries = data.get('enemies')
    if entries is not None:
        if not isinstance(entries, list) or not 1 <= len(entries) <= 255:
            raise ValueError('encounter table requires 1..255 entries')
        seen = set()
        payload = []
        for entry in entries:
            if not isinstance(entry, dict):
                raise ValueError('invalid encounter table entry')
            enemy = integer(entry.get('enemyId'), 0, 255, 'enemy id')
            weight = integer(entry.get('weight'), 1, 255, 'encounter weight')
            if enemy not in ENEMIES or enemy in seen:
                raise ValueError('unknown or duplicate encounter enemy')
            seen.add(enemy)
            payload.extend([enemy, weight])
        if fractional:
            return bytes([126 | (128 if data['enabled'] else 0)]) + struct.pack('<H', round(rate * 100)) + bytes([len(entries), *payload])
        if len(entries) > 1:
            return bytes([127 | (128 if data['enabled'] else 0), int(rate), len(entries), *payload])
        enemy = entries[0]['enemyId']
    else:
        enemy = integer(data.get('enemyId'), 0, 255, 'enemy id')
    if enemy not in ENEMIES:
        raise ValueError('unknown encounter enemy')
    if fractional:
        return bytes([126 | (128 if data['enabled'] else 0)]) + struct.pack('<H', round(rate * 100)) + bytes([1, enemy, 1])
    return bytes([(int(rate) + 1) | (128 if data['enabled'] else 0), enemy])


def normalize_buildings(stage):
    anchor = stage.get('buildingAnchor')
    if anchor not in (None, 'frame'):
        raise ValueError('unknown building anchor')
    if anchor == 'frame':
        return stage
    def normalize(entry):
        if entry['kind'] not in BUILDING_OVERHANGS:
            return entry
        coordinate(entry['x'], stage['width'], 'entity x')
        return {**entry, 'x': entry['x'] + BUILDING_OVERHANGS[entry['kind']]}
    return {**stage, 'buildingAnchor': 'frame', 'entities': [
        normalize(e) for e in stage['entities']]}


def compile_stage(stage, force_codec=None, version=9, compact=False, stage_ids=None):
    if version >= 14:
        stage = normalize_buildings(stage)
    if version >= 13 and stage_ids is None:
        raise ValueError("v13 requires world stage IDs")
    cells, encodings, local_palette = encode_floor(stage, optimize=compact)
    codec = CODECS.index(force_codec) if force_codec else min(
        (i for i in range(3) if encodings[i] is not None), key=lambda i: len(encodings[i]))
    floor = encodings[codec]
    if floor is None:
        raise ValueError('RECT supports at most 255 rectangles; use RAW or RLE for this map')
    width, height = stage['width'], stage['height']
    spawn = stage.get('spawn')
    anchor = stage.get('spawnAnchor')
    if anchor not in (None, 'frame'):
        raise ValueError('unknown spawn anchor')
    sx, sy = (255, 255) if spawn is None else (
        coordinate(integer(spawn['x'], 0, 510, 'spawn x') + (8 if anchor is None else 0), width, 'spawn x'),
        coordinate(spawn['y'], height, 'spawn y'))
    if spawn is not None and (sx == 255 or sy == 255):
        raise ValueError('spawn: 255 is reserved for an unset starting position')
    if spawn is not None and (sx * 2 + 16 > width * 16 or sy * 2 + 32 > height * 16):
        raise ValueError('spawn: the 1x2 player frame must fit inside the map')
    def grid_position(entry):
        x = entry['x']
        if entry['kind'] in NPCS and stage.get('npcAnchor') is None and not (entry['kind'] in RESIDENTS and stage.get('residentAnchor') == 'frame'):
            x += 8
        frame = FRAMES.get(entry['kind'], {'x': 0, 'y': 0})
        return x + frame['x'], entry['y'] + frame['y']
    packed = compact and all(all(v >= 0 and v % 16 == 0 and v // 16 < 32 for v in grid_position(e)) for e in stage['entities'])

    entities = bytearray()
    resident_anchor = stage.get('residentAnchor')
    if resident_anchor not in (None, 'frame'):
        raise ValueError('unknown resident anchor')
    npc_anchor = stage.get('npcAnchor')
    if npc_anchor not in (None, 'frame'):
        raise ValueError('unknown npc anchor')
    integer(len(stage['entities']), 0, 255, 'entity count')
    for entry in stage['entities']:
        kind = entry['kind']
        if kind not in ENTITIES:
            raise ValueError(f'unknown entity: {kind}')
        entity_id, parameter_count = ENTITIES[kind]
        parameters = entry.get('parameters', [])
        if len(parameters) != parameter_count:
            raise ValueError(f'{kind}: expected {parameter_count} parameters')
        for value in parameters:
            integer(value, 0, 255, f'{kind} parameter')
        if kind == 'king' and parameters[0] not in (0, 1):
            raise ValueError('king: encounter flag must be 0 or 1')
        if kind == 'loot' and parameters[0] >= 8:
            raise ValueError('loot: phase must be from 0 to 7')
        if kind.startswith('moat-') and any(value == 0 for value in parameters):
            raise ValueError('moat bank dimensions must be positive')
        if kind.startswith('moat-') and (entry['x'] + parameters[0] * 2 > width * 16
                                        or entry['y'] + parameters[1] * 2 > height * 16):
            raise ValueError('moat bank outside map')
        x = integer(entry['x'], 0, 510, 'entity x')
        if kind in NPCS and npc_anchor is None and not (kind in RESIDENTS and resident_anchor == 'frame'):
            x += 8
        encoded_x = coordinate(x, width, 'entity x')
        encoded_y = coordinate(entry['y'], height, 'entity y')
        if kind in NPCS and (x + 16 > width * 16 or entry['y'] + 32 > height * 16):
            raise ValueError('npc: the 1x2 frame must fit inside the map')
        frame = FRAMES.get(kind)
        if frame and version < 14 and kind in BUILDING_OVERHANGS:
            frame = {**frame, 'width': frame['width'] + BUILDING_OVERHANGS[kind] * 2}
        if frame and (x + frame['x'] < 0 or entry['y'] + frame['y'] < 0
                      or x + frame['x'] + frame['width'] > width * 16
                      or entry['y'] + frame['y'] + frame['height'] > height * 16):
            raise ValueError(f'{kind}: placement frame outside map')
        if packed:
            frame = FRAMES.get(kind, {'x': 0, 'y': 0})
            value = entity_id << 10 | (x + frame['x']) // 16 << 5 | (entry['y'] + frame['y']) // 16
            entities.extend([value >> 8, value & 255, *parameters])
        else:
            entities.extend([parameter_count << 6 | entity_id, encoded_x, encoded_y, *parameters])
    header = struct.pack('<6BHB', integer(stage['id'], 0, 255, 'stage id'),
                         width, height, sx, sy, codec | (128 if local_palette else 0) | (64 if packed else 0), len(floor), len(stage['entities']))
    interactions = encode_interactions(stage['entities'])
    extra = struct.pack('<H', len(interactions)) + interactions
    exits = encode_exits(stage, stage_ids if version >= 13 else None)
    encounter = encode_encounter(stage, version)
    events = encode_battle_events(stage['entities']) if version >= 10 else b''
    report = {
        'id': stage['id'], 'name': stage['name'], 'width': width, 'height': height,
        'floor_bytes': {name: len(data) if data is not None else None for name, data in zip(CODECS, encodings)},
        'selected_codec': CODECS[codec],
        'header_bytes': len(header), 'entity_count': len(stage['entities']),
        'entity_bytes': len(entities), 'interaction_bytes': len(extra),
        'exit_bytes': len(exits),
        'encounter_bytes': len(encounter) + len(events),
        'stage_bytes': len(header) + len(floor) + len(entities) + len(extra) + len(exits) + len(encounter) + len(events),
        'tile_counts': {CATALOG['tiles'][key]: value for key, value in sorted(Counter(cells).items())},
    }
    return header + floor + entities + extra + exits + encounter + events, report


def compile_game(stages, force_codec=None, compact=False):
    if len(TILES) > 256 or len(ENTITIES) > 64:
        raise ValueError('supports at most 256 tile IDs and 64 entity IDs')
    integer(len(stages), 1, 255, 'stage count')
    if len({stage['id'] for stage in stages}) != len(stages):
        raise ValueError('duplicate stage ids')
    version = 9 if any(tile_id(name) >= 16 for stage in stages for name in [stage['floor']['default'], *(r['tile'] for r in stage['floor']['rectangles'])]) else 8
    if compact:
        version = 11
    elif any(e.get('battleEvent') for s in stages for e in s['entities']):
        version = 10
    if any(isinstance(s.get('encounter'), dict) and isinstance(s['encounter'].get('enemies'), list) and len(s['encounter']['enemies']) > 1 for s in stages):
        version = 12
    if compact and any(stage.get('exits') for stage in stages):
        version = 13
    if any(e['kind'] in BUILDING_OVERHANGS for stage in stages for e in stage['entities']):
        version = 14
    for stage in stages:
        encounter = stage.get('encounter')
        rate = encounter.get('rate') if isinstance(encounter, dict) else None
        if type(rate) in (int, float) and math.isfinite(rate) and rate != int(rate):
            version = 15
    binary = bytearray(b'TQ' + bytes([version, len(stages)]))
    reports = []
    for stage in stages:
        data, report = compile_stage(stage, force_codec, version, compact, [s['id'] for s in stages] if version >= 13 else None)
        binary.extend(data)
        reports.append(report)
    for stage in stages:
        for entry in stage.get('exits', []):
            target = next((candidate for candidate in stages if candidate['id'] == entry['targetStageId']), None)
            if target is None or entry['targetX'] >= target['width'] or entry['targetY'] >= target['height']:
                raise ValueError('exit target missing or arrival outside target map')
    return bytes(binary), reports


def ndef_size(url):
    prefix = next((p for p in ('https://www.', 'http://www.', 'https://', 'http://') if url.startswith(p)), '')
    payload = 1 + len(url[len(prefix):].encode('utf-8'))
    record = (4 if payload <= 255 else 7) + payload
    return (2 if record < 255 else 4) + record + 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--compact', action='store_true', help='optimize RECT floors, grid entities and v13 packed exits')
    parser.add_argument('--maps', nargs='+', type=Path,
                        default=[ROOT / 'compiler/maps/castle.json', ROOT / 'compiler/maps/town.json'])
    parser.add_argument('--out', type=Path, default=ROOT / 'web/src/data/generated/scenes.bin')
    parser.add_argument('--base-url', default=PUBLIC_CONFIG['baseUrl'])
    args = parser.parse_args()
    if not args.base_url.startswith('https://') or '#' in args.base_url:
        parser.error('--base-url must be an HTTPS URL without a fragment')
    stages = []
    for path in args.maps:
        source = json.loads(path.read_text())
        stages.extend(source if isinstance(source, list) else source.get('stages', [source]))
    binary, reports = compile_game(stages, compact=args.compact)
    encoded = base64.urlsafe_b64encode(binary).rstrip(b'=').decode('ascii')
    url = args.base_url + '#' + encoded
    report = {
        'format': f'TQ v{binary[2]} experimental', 'binary_bytes': len(binary),
        'base64url_chars': len(encoded), 'base_url': args.base_url,
        'final_url_bytes': len(url.encode('utf-8')), 'binary_target_bytes': 300,
        'remaining_to_binary_target_bytes': 300 - len(binary),
        'includes_ndef_overhead': True, 'ndef_tlv_bytes': ndef_size(url), 'ntag215_ndef_capacity_bytes': 496, 'remaining_ntag215_bytes': 496 - ndef_size(url), 'stages': reports,
        'binary_bytes_by_floor_codec': {
            codec: 4 + sum(stage['header_bytes'] + stage['entity_bytes'] + stage['interaction_bytes'] + stage['exit_bytes'] + stage['encounter_bytes'] + stage['floor_bytes'][codec]
                           for stage in reports) if all(stage['floor_bytes'][codec] is not None for stage in reports)
            else None for codec in CODECS
        },
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_bytes(binary)
    args.out.with_suffix('.report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    args.out.with_suffix('.url.txt').write_text(url + '\n')
    for stage in reports:
        sizes = ', '.join(f'{name}={size}B' if size is not None else f'{name}=unavailable'
                          for name, size in stage['floor_bytes'].items())
        print(f"{stage['name']} {stage['width']}x{stage['height']}: floor {sizes}; "
              f"selected={stage['selected_codec']}, entities={stage['entity_bytes']}B, "
              f"interactions={stage['interaction_bytes']}B, exits={stage['exit_bytes']}B, "
              f"encounter={stage['encounter_bytes']}B, total={stage['stage_bytes']}B")
    print(f'Binary: {len(binary)}B / 300B target')
    print(f'Base64url: {len(encoded)} chars; final URL: {report["final_url_bytes"]}B; NDEF/TLV: {report["ndef_tlv_bytes"]}B / 496B')
    print(f'Output: {args.out}')


if __name__ == '__main__':
    main()
