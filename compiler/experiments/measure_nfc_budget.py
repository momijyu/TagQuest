"""Offline size report only. Does not adopt a compression format or write NFC data.
Run after npm run export:adventure: python3 compiler/experiments/measure_nfc_budget.py
"""
import base64
import hashlib
import json
import sys
import zlib
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'compiler'))
from build import compile_game, ndef_size
BASE = 'https://tagquest.vercel.app/'

def metrics(data):
    url = BASE + '#' + base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')
    ndef = ndef_size(url)
    return {'binary_bytes': len(data), 'url_bytes': len(url.encode()), 'ndef_tlv_bytes': ndef,
            'remaining_ntag215_bytes': 496 - ndef}

if __name__ == '__main__':
    stages = json.loads((ROOT / 'art/adventure/world.json').read_text())['stages']
    binary, reports = compile_game(stages, compact=True)
    assert binary == (ROOT / 'art/adventure/world.bin').read_bytes()
    compressed = zlib.compress(binary, level=9, wbits=-15)
    assert zlib.decompress(compressed, wbits=-15) == binary
    result = {'base_url': BASE, 'ntag215_default_ndef_bytes': 496,
              'source_sha256': hashlib.sha256(binary).hexdigest(), 'format_version': binary[2],
              'current': metrics(binary), 'stages': reports,
              'deflate_trial_only': {**metrics(bytes(4) + compressed), 'envelope_bytes': 4,
                                    'zlib_runtime': zlib.ZLIB_RUNTIME_VERSION},
              'max_binary_for_this_url_and_capacity': max(n for n in range(600) if metrics(bytes(n))['ndef_tlv_bytes'] <= 496)}
    output = ROOT / 'docs/nfc-optimization-2026-10-12.json'
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'stages'}, ensure_ascii=False, indent=2))
