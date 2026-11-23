"""Retain the parent reproduction, final checks and screenshots for shared CV Saves."""

import hashlib
import json
import subprocess
import sys
from pathlib import Path

from evidence_bundle import changed_sources, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'ci-logs'
parent = '8d367c3491dfde6322fe0441e33dc9b69419a63b'
checks = {
    'published.log': ('Stale target CV export must preserve', '"state":"saved"'),
    'unit-node.log': ('pass 62', 'fail 0'),
    'unit-deno.log': ('62 passed | 0 failed',),
    'unit-bun.log': ('62 pass', '0 fail'),
    'browser-final.log': ('[e2e-cv-save-watch] OK (chromium)',
                          '"staleExport":true', '"staleExport":false'),
    'lint.log': ('0 errors',),
    'format.log': ('All matched files use Prettier code style!',),
    'secrets.log': (),
    'diff.log': (),
}
entries = {}
for name, fragments in checks.items():
    path = logs / f'followup-{name}'
    payload = path.read_bytes()
    assert all(fragment.encode() in payload for fragment in fragments), name
    assert fragments or not payload.strip(), name
    entries[f'validation/{path.name}'] = payload

receipt = (logs / 'followup-mcp-receipt.json').read_bytes()
assert json.loads(receipt) == {
    'outcome': 'not-saved', 'phoneRecovered': True, 'saves': 2,
    'attached': 6, 'detached': 6, 'snapshots': [
        {'recordId': '987', 'checked': True, 'jobs': 3},
        {'recordId': '987', 'checked': False, 'jobs': 2},
    ], 'authenticatedProvider': False,
}
entries['validation/mcp-receipt.json'] = receipt
sources = [name for name in changed_sources(root) if not name.endswith('.png')]
for name in sources:
    entries[name] = (root / name).read_bytes()
    if name.startswith('js/src/jobs/'):
        entries[f'before/{name}'] = subprocess.check_output(
            ['git', 'show', f'{parent}:{name}'], cwd=root)
metadata = {
    'parent': parent,
    'browser': 'Chromium',
    'authenticatedProvider': False,
    'screenshots': {
        str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted((root / 'docs/screenshots/issue-56-cv-workplace-followup').glob('**/*.png'))
    },
}
entries['metadata.json'] = (json.dumps(metadata, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/cv-workplace-followup.tar.gz',
                      entries, len(sources))
