"""Archive finite source, runtime and browser evidence for reviewed workplace copy."""

import hashlib
import json
import subprocess
import sys
from pathlib import Path

from evidence_bundle import changed_sources, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'ci-logs'
base = 'e0ad3a5b369a5addf8fe789e435123d4987c1b0c'
prefix = 'cv-workplace-copy-'
checks = {
    'before.log': ('fail 3', 'jobs-cv-options', '400 !== 200'),
    'node-final.log': ('pass 35', 'fail 0'),
    'deno-final.log': ('35 passed | 0 failed',),
    'bun-final.log': ('35 pass', '0 fail'),
    'browser-final.log': ('[e2e-cv-workplace-copy] OK (chromium)',),
    'compat-final.log': ('[e2e-cv-workplace-compat] OK (chromium)',),
    'lint-final.log': ('0 errors',),
    'format-final.log': ('All matched files use Prettier code style!',),
    'changeset.log': ('meta-sovereign',),
    'secrets-final.log': (),
    'diff.log': (),
    'build.log': ('app.min.js',),
    'focused-targets.txt': ('cv-workplace-copy.test.js',),
}
entries = {}
for name, fragments in checks.items():
    path = logs / (prefix + name)
    payload = path.read_bytes()
    assert all(fragment.encode() in payload for fragment in fragments), name
    assert fragments or not payload.strip(), name
    entries[f'validation/{path.name}'] = payload

receipt = (logs / (prefix + 'mcp-receipt.json')).read_bytes()
assert {key: json.loads(receipt)[key] for key in
        ('attached', 'detached', 'reads', 'saves', 'errors', 'authenticatedProvider')} == {
    'attached': 2, 'detached': 2, 'reads': 2, 'saves': 0, 'errors': [],
    'authenticatedProvider': False,
}
entries['validation/mcp-receipt.json'] = receipt
for source in ('cv-workplace-copy-donor.mjs', 'cv-workplace-experience-sites-donor.mjs'):
    entries[f'reference/{source}'] = (logs / source).read_bytes()

bundle = 'js/src/web/app.min.js'
sources = [name for name in changed_sources(root) if name != bundle]
for name in sources:
    entries[name] = (root / name).read_bytes()
for name in ('js/src/jobs/cv-workplace-review-service.js',
             'js/src/jobs/cv-workplace-plan.js'):
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'{base}:{name}'], cwd=root)
metadata = {
    'parent': base,
    'parentBundleSha256': hashlib.sha256(subprocess.check_output(
        ['git', 'show', f'{base}:{bundle}'], cwd=root)).hexdigest(),
    'currentBundleSha256': hashlib.sha256((root / bundle).read_bytes()).hexdigest(),
    'nativeBrowser': 'Chromium',
    'workplaceSaveClicksByPreparation': 0,
    'mcp': True,
    'authenticatedProvider': False,
}
entries['metadata.json'] = (json.dumps(metadata, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/cv-workplace-copy.tar.gz',
                      entries, len(sources))
