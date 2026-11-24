"""Retain the independent workplace Add verification and provider-fixture receipt."""

import hashlib
import json
from pathlib import Path
import sys

from evidence_bundle import changed_sources, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'ci-logs'
checks = {
    'node.log': ('pass 32', 'fail 0'),
    'deno.log': ('32 passed | 0 failed',),
    'bun.log': ('32 pass', '0 fail'),
    'browser-final.log': ('[e2e-cv-prepare] OK (chromium)',
                          'verifyCvWorkplaceAdd","phase":"passed"'),
    'browser-watch.log': ('[e2e-cv-save-watch] OK (chromium)',),
    'lint.log': ('0 errors',),
    'format.log': ('All matched files use Prettier code style!',),
    'secrets.log': (),
    'diff.log': (),
}
entries = {}
for name, fragments in checks.items():
    path = logs / f'add-{name}'
    contents = path.read_bytes()
    assert all(fragment.encode() in contents for fragment in fragments), name
    assert fragments or not contents.strip(), name
    entries[f'validation/{path.name}'] = contents

receipt = (logs / 'add-mcp-result.json').read_bytes()
outcomes = json.loads(receipt)
before, after = outcomes['before'], outcomes['after']
assert before['saves'] == 0 and before['attached'] == before['detached'] == 1
assert after['saves'] == 1 and after['attached'] == after['detached'] == 2
assert not before['authenticatedProvider'] and not after['authenticatedProvider']
assert not before['snapshots'] and not before['errors'] and not after['errors']
assert [(row['workplace']['recordId'], row['workplace']['checked'], row['jobs'])
        for row in after['snapshots']] == [('987', True, 1), ('987', False, 2)]
entries['validation/mcp-receipt.json'] = receipt

bundle = 'js/src/web/app.min.js'
sources = [name for name in changed_sources(root) if name != bundle
           and not name.endswith('.png')]
for name in sources:
    entries[name] = (root / name).read_bytes()
metadata = {
    'parent': '23103a0c9851ad123a26ba5acbf29568fbcff681',
    'browser': 'Chromium',
    'authenticatedProvider': False,
    'generatedSpa': hashlib.sha256((root / bundle).read_bytes()).hexdigest(),
    'screenshots': {
        path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted((root / 'docs/screenshots/issue-56-cv-workplace-add').glob('**/*.png'))
    },
}
entries['metadata.json'] = (json.dumps(metadata, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/cv-workplace-add.tar.gz',
                      entries, len(sources))
