import copy
import json
import unittest

from build import ROOT, NPCS, RESIDENTS, BUILDING_OVERHANGS, FRAMES, compile_game, encode_floor, encode_encounter, normalize_buildings


class CompilerTests(unittest.TestCase):
    def setUp(self):
        self.stages = [json.loads((ROOT / f'compiler/maps/{name}.json').read_text())
                       for name in ('castle', 'town')]

    def test_size_reports_match_binary(self):
        binary, reports = compile_game(self.stages)
        self.assertEqual(len(binary), 4 + sum(stage['stage_bytes'] for stage in reports))
        self.assertEqual(len(binary), 206)
        self.assertEqual([stage['exit_bytes'] for stage in reports], [4, 4])
        self.assertEqual([stage['encounter_bytes'] for stage in reports], [7, 2])
        self.assertEqual([stage['interaction_bytes'] for stage in reports], [6, 27])
        self.assertEqual([stage['selected_codec'] for stage in reports], ['RECT', 'RECT'])

    def test_all_floor_codecs_can_be_compiled(self):
        for codec in ('RAW', 'RLE', 'RECT'):
            _, reports = compile_game(self.stages, codec)
            self.assertTrue(all(stage['selected_codec'] == codec for stage in reports))

    def test_fractional_encounter_rates_preserve_probability(self):
        stages = copy.deepcopy(self.stages)
        stages[0]['encounter']['rate'] = 0.5
        original = copy.deepcopy(stages)
        for compact in (False, True):
            binary, reports = compile_game(stages, compact=compact)
            self.assertEqual(binary[2], 15)
            self.assertEqual(reports[0]['encounter_bytes'], 7)
        self.assertEqual(stages, original)
        self.assertEqual(encode_encounter(stages[0]), bytes([254, 50, 0, 1, 0, 1]))
        with self.assertRaises(ValueError):
            encode_encounter(stages[0], version=14)
        for invalid in (0.001, float('inf'), float('nan'), True, -0.5, 100.01):
            stages[0]['encounter']['rate'] = invalid
            with self.assertRaises(ValueError):
                compile_game(stages)

    def test_invalid_dimensions_and_coordinates_are_rejected(self):
        for value in (0, 33, True):
            stages = copy.deepcopy(self.stages)
            stages[0]['width'] = value
            with self.assertRaises(ValueError):
                compile_game(stages)
        for value in (1, -2, 112):
            stages = copy.deepcopy(self.stages)
            stages[0]['entities'][0]['x'] = value
            with self.assertRaises(ValueError):
                compile_game(stages)

    def test_unknown_ids_and_invalid_parameters_are_rejected(self):
        changes = [('kind', 'missing'), ('parameters', [1])]
        for key, value in changes:
            stages = copy.deepcopy(self.stages)
            stages[0]['entities'][0][key] = value
            with self.assertRaises(ValueError):
                compile_game(stages)
        stages = copy.deepcopy(self.stages)
        stages[0]['entities'][1]['parameters'] = [2]
        with self.assertRaises(ValueError):
            compile_game(stages)

    def test_reserved_spawn_coordinates_are_rejected(self):
        stage = {'id': 2, 'name': 'edge', 'width': 32, 'height': 32,
                 'spawnAnchor': 'frame',
                 'floor': {'default': 'marble', 'rectangles': []}, 'entities': []}
        for x, y in ((510, 0), (0, 510), (510, 510)):
            stage['spawn'] = {'x': x, 'y': y}
            with self.assertRaises(ValueError):
                compile_game([stage])
        stage['spawn'] = {'x': 496, 'y': 480}
        compile_game([stage])
        stage['spawn'] = {'x': 496, 'y': 482}
        with self.assertRaises(ValueError):
            compile_game([stage])

    def test_legacy_spawn_is_converted_without_moving_the_drawing(self):
        legacy = copy.deepcopy(self.stages)
        legacy[0].pop('spawnAnchor')
        legacy[0]['spawn']['x'] -= 8
        self.assertEqual(compile_game(legacy)[0], compile_game(self.stages)[0])
        legacy[0]['spawnAnchor'] = 'unknown'
        with self.assertRaises(ValueError):
            compile_game(legacy)

    def test_legacy_residents_keep_their_drawing_positions(self):
        legacy = copy.deepcopy(self.stages)
        for stage in legacy:
            stage.pop('npcAnchor')
            stage.pop('residentAnchor')
            for entity in stage['entities']:
                if entity['kind'] in NPCS:
                    entity['x'] -= 8
        self.assertEqual(compile_game(legacy)[0], compile_game(self.stages)[0])

    def test_v3_json_keeps_all_npc_drawing_positions(self):
        legacy = copy.deepcopy(self.stages)
        for stage in legacy:
            stage.pop('npcAnchor')
            for entity in stage['entities']:
                if entity['kind'] in NPCS and entity['kind'] not in RESIDENTS:
                    entity['x'] -= 8
        self.assertEqual(compile_game(legacy)[0], compile_game(self.stages)[0])

    def test_every_npc_fits_one_column_and_requires_two_rows(self):
        for kind in NPCS:
            stage = {'id': 0, 'name': kind, 'width': 1, 'height': 2, 'spawn': None,
                     'npcAnchor': 'frame', 'floor': {'default': 'empty', 'rectangles': []},
                     'entities': [{'kind': kind, 'x': 0, 'y': 0, 'parameters': [1] if kind == 'king' else []}]}
            compile_game([stage])
            for x, y in ((2, 0), (0, 2)):
                stage['entities'][0].update(x=x, y=y)
                with self.assertRaises(ValueError):
                    compile_game([stage])

    def test_invalid_rectangles_and_duplicate_stages_are_rejected(self):
        stage = copy.deepcopy(self.stages[0])
        stage['floor']['rectangles'][0]['width'] = 8
        with self.assertRaises(ValueError):
            encode_floor(stage)
        with self.assertRaises(ValueError):
            compile_game([self.stages[0], self.stages[0]])

    def test_object_frames_cannot_overhang_map(self):
        stage = {'id': 0, 'name': 'tiny', 'width': 1, 'height': 1,
                 'spawn': None, 'floor': {'default': 'grass', 'rectangles': []},
                 'entities': [{'kind': 'tree', 'x': 0, 'y': 0, 'parameters': []}]}
        with self.assertRaisesRegex(ValueError, 'placement frame'):
            compile_game([stage])

    def test_battle_event_config_and_compact_counts(self):
        stage = copy.deepcopy(self.stages[0])
        # Keep coverage of v10/v11 independently of the sample's fractional rate.
        stage['encounter']['rate'] = 10
        stage['exits'] = []
        king = next(e for e in stage['entities'] if e['kind'] == 'king')
        king['battleEvent'] = {'enemyId': 4, 'once': True, 'clear': True}
        for compact in (False, True):
            binary, reports = compile_game([stage], compact=compact)
            self.assertEqual(binary[2], 11 if compact else 10)
            self.assertEqual(len(binary), 4 + sum(r['stage_bytes'] for r in reports))
        for event in ({'enemyId': 99, 'once': True, 'clear': True},
                      {'enemyId': 4, 'once': False, 'clear': True},
                      {'enemyId': 4, 'once': 1, 'clear': False}):
            king['battleEvent'] = event
            with self.assertRaises(ValueError):
                compile_game([stage])

    def test_compact_exit_version_and_reports(self):
        before = copy.deepcopy(self.stages)
        binary, reports = compile_game(self.stages, compact=True)
        self.assertEqual(binary[2], 15)
        self.assertEqual([r['exit_bytes'] for r in reports], [4, 4])
        self.assertEqual(len(binary), 4 + sum(r['stage_bytes'] for r in reports))
        self.assertEqual(self.stages, before)

    def test_compact_floor_rejects_invalid_overwritten_rect(self):
        stages = copy.deepcopy(self.stages)
        stages[0]['floor']['rectangles'].insert(0, {'tile': 'grass', 'x': 7, 'y': 0, 'width': 1, 'height': 1})
        with self.assertRaises(ValueError):
            compile_game(stages, compact=True)

    def test_input_is_not_mutated(self):
        before = copy.deepcopy(self.stages)
        compile_game(self.stages)
        self.assertEqual(self.stages, before)

    def test_building_frames_fit_two_columns_with_original_height(self):
        for kind in BUILDING_OVERHANGS:
            stage = {'id': 0, 'name': kind, 'width': 2, 'height': FRAMES[kind]['height'] // 16,
                     'spawn': None, 'buildingAnchor': 'frame',
                     'floor': {'default': 'grass', 'rectangles': []},
                     'entities': [{'kind': kind, 'x': 0, 'y': 0, 'parameters': []}]}
            binary, reports = compile_game([stage], compact=True)
            self.assertEqual(binary[2], 14)
            self.assertEqual(reports[0]['entity_bytes'], 2)
            stage['width'] = 1
            with self.assertRaisesRegex(ValueError, 'placement frame'):
                compile_game([stage])

    def test_legacy_buildings_normalize_once_and_reject_invalid_coordinates(self):
        normalized = [normalize_buildings(s) for s in self.stages]
        for compact in (False, True):
            self.assertEqual(compile_game(normalized, compact=compact)[0], compile_game(self.stages, compact=compact)[0])
        self.assertEqual([normalize_buildings(s) for s in normalized], normalized)
        for value in (True, False, '64', -2, 1):
            bad = copy.deepcopy(self.stages)
            next(e for e in bad[1]['entities'] if e['kind'] == 'castle')['x'] = value
            with self.assertRaises(ValueError):
                compile_game(bad)


if __name__ == '__main__':
    unittest.main()
