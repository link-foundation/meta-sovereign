"""Archive the focused Forms link regressions and browser receipts."""

import hashlib
import json
from pathlib import Path
import subprocess
import sys

from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
results = Path(sys.argv[1])
revision = sys.argv[2] if len(sys.argv) > 2 else 'HEAD'
parent = '580a2012200794b16a1ca6e541b5917110853bdc'
prefix = 'assignment-linked-'
checks = {
    'parent-node.log': 'fail 3',
    'parent-browser.log': 'only the visible instruction link enters the plan',
    'node.log': 'pass 42',
    'deno.log': '42 passed | 0 failed',
    'browser.log': '[e2e-forms-reader] OK (chromium)',
}
for name, receipt in checks.items():
    assert receipt in (results / (prefix + name)).read_text(), name
for name in ('eslint.log', 'secretlint.log', 'diff.log'):
    assert not (results / (prefix + name)).read_text().strip(), name

mcp = json.loads((results / (prefix + 'mcp.json')).read_text())
assert mcp['disabledBeforeSelection'] and not mcp['requestsBeforeDraft']
assert mcp['width'] == {'content': 390, 'viewport': 390}
assert mcp['requests'] == ['draft'] and not mcp['errors']
server = json.loads((results / (prefix + 'mcp-fixture.log')).read_text().splitlines()[-1])
assert server == {
    'forms': [{'value': '', 'closed': True}], 'sources': [True], 'modelCalls': 1,
    'externalWrites': False, 'submissions': 0,
}
changed = subprocess.check_output(['git', 'diff', '--name-only', parent, revision],
                                  cwd=root, text=True).splitlines()
sources = [name for name in changed if name.startswith(('js/', 'experiments/'))
           and name.endswith(('.js', '.mjs', '.py')) and name != 'js/src/web/app.min.js']
entries = {name: (root / name).read_bytes() for name in sources}
for name in [*checks, 'build.log', 'mcp.json', 'mcp-fixture.log', 'eslint.log',
             'secretlint.log', 'diff.log']:
    path = results / (prefix + name)
    entries[f'logs/{path.name}'] = path.read_bytes()
for name in ('js/src/forms/read-document.js', 'js/src/assignments/draft.js'):
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'{parent}:{name}'], cwd=root)
metadata = {
    'parent': parent,
    'mcp': mcp,
    'isolatedServer': server,
    'screenshots': {
        image.name: hashlib.sha256(image.read_bytes()).hexdigest()
        for image in sorted((root / 'docs/screenshots').glob('issue-56-assignment-linked-*.png'))
    },
    'remaining': 'QA24 direct unsupported document acquisition and remaining hosted or live checks.',
}
entries['metadata.json'] = (json.dumps(metadata, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/assignment-detected-links.tar.gz',
                      entries, len(sources))
