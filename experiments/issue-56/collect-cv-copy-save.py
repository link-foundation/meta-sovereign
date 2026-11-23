"""Retain the exact-parent and changed watcher sources with measured Save evidence."""

import hashlib
import json
import subprocess
import sys
from pathlib import Path

from evidence_bundle import changed_sources, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'ci-logs'
parent = 'f1467967b26789dd735b21705a975d998ea2c775'
checks = {
    'before.log': ('fail 3', 'Missing expected rejection'),
    'node-final.log': ('pass 52', 'fail 0'),
    'deno-final.log': ('52 passed | 0 failed',),
    'bun-final.log': ('52 pass', '0 fail'),
    'native-before.log': ('"identicalCopyRefused":true', '"staleCopyAccepted":true'),
    'native-after.log': ('"identicalCopyVerified":true', '"staleCopyRefused":true'),
    'browser-final.log': ('[e2e-cv-save-watch] OK (chromium)',),
    'lint.log': ('0 errors',),
    'format.log': ('All matched files use Prettier code style!',),
    'secrets.log': (),
    'diff.log': (),
}
entries = {}
for name, fragments in checks.items():
    path = logs / f'cv-copy-save-{name}'
    payload = path.read_bytes()
    assert all(fragment.encode() in payload for fragment in fragments), name
    assert fragments or not payload.strip(), name
    entries[f'validation/{path.name}'] = payload

receipt = (logs / 'cv-copy-save-mcp-receipt.json').read_bytes()
assert json.loads(receipt) == {
    'newRecord': '987', 'savedTargetJobs': 2, 'preSaveExports': 2,
    'staleCopyRefused': True, 'phoneRestored': True, 'ownerSaves': 2,
    'attachments': 2, 'detached': 2, 'authenticatedProvider': False,
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
        for path in sorted((root / 'docs/screenshots/issue-56-cv-copy-save').glob('**/*.png'))
    },
}
entries['metadata.json'] = (json.dumps(metadata, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/cv-copy-save.tar.gz',
                      entries, len(sources))
