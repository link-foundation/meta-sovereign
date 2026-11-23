"""Retain verified native workplace form transitions and the parent failure."""

import hashlib
import json
from pathlib import Path
import sys

from evidence_bundle import changed_sources, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'ci-logs'
checks = {
    'watch-transition-before.log': (
        '"state":"saved","code":null,"saves":1',
        'waiting for locator(\'[data-cv-save-watch]\').locator(\'[data-cv-watch-state="not-saved"]\')',
    ),
    'watch-transition-after.log': (
        '[e2e-cv-watch-transitions] OK (chromium)',
        '"state":"not-saved","code":"jobs-cv-mismatch","saves":1',
    ),
    'watch-transition-watch-chromium.log': (
        'verifyCvWatchTransitions","phase":"passed"',
        '[e2e-cv-save-watch] OK (chromium)',
    ),
    'transition-node.log': ('pass 43', 'fail 0'),
    'transition-deno.log': ('43 passed | 0 failed',),
    'transition-bun.log': ('43 pass', '0 fail'),
    'transition-web.log': ('Done in',),
    'transition-lint.log': ('0 errors',),
    'transition-format.log': ('All matched files use Prettier code style!',),
    'transition-secrets.log': (),
    'transition-diff.log': (),
}
entries = {}
for name, fragments in checks.items():
    contents = (logs / name).read_bytes()
    assert all(fragment.encode() in contents for fragment in fragments), name
    assert fragments or not contents.strip(), name
    entries[f'validation/{name}'] = contents

receipt = (logs / 'transition-mcp-result.json').read_bytes()
outcomes = json.loads(receipt)
before, after = outcomes['before'], outcomes['after']
assert before['watch'] == {'code': None, 'state': 'watching', 'saves': 0}
assert after['watch'] == {'code': 'jobs-cv-mismatch', 'state': 'stopped', 'saves': 0}
assert before['saves'] == 0 and after['saves'] == 1
assert before['reads'] == 0 and 3 <= after['reads'] <= 100
assert after['navigations'] == before['navigations'] + 3
assert before['attached'] == after['attached'] == after['detached'] == 1
assert before['detached'] == 0
assert all(not row[key] for row in (before, after)
           for key in ('authenticatedProvider', 'snapshots', 'errors'))
entries['validation/mcp-receipt.json'] = receipt

bundle = 'js/src/web/app.min.js'
sources = [name for name in changed_sources(root) if name != bundle
           and not name.endswith('.png')]
for name in sources:
    entries[name] = (root / name).read_bytes()
metadata = {
    'parent': 'c0fbd85cc20ce5d28d29c5dbab68d9b7afb2debd',
    'browser': 'Chromium',
    'authenticatedProvider': False,
    'generatedSpa': hashlib.sha256((root / bundle).read_bytes()).hexdigest(),
    'screenshots': {
        path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted((root / 'docs/screenshots/issue-56-cv-watch-transitions').glob('**/*.png'))
    },
}
entries['metadata.json'] = (json.dumps(metadata, indent=2) + '\n').encode()
archive = root / 'docs/case-studies/issue-56/data/cv-watch-transitions.tar.gz'
write_entries_archive(archive, entries, len(sources))
