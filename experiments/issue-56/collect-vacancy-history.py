"""Preserve actual-parent and shared vacancy observation history evidence."""
import base64
import hashlib
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
parent = 'b873b283'
paths = [
    'js/src/assignments/vacancy-history.js', 'js/src/assignments/vacancy.js',
    'js/src/assignments/vacancy-content.js', 'js/src/assignments/vacancy-legacy-content.js',
    'js/src/assignments/vacancy-legacy-cache.js', 'js/src/storage/acknowledged-record.js',
    'js/src/jobs/service.js', 'js/src/jobs/technology-service.js',
    'js/src/web/vacancy-api.js', 'js/src/web/vacancies-panel.js', 'js/src/web/app.min.js',
    'js/src/cli/vacancy-commands.js', 'js/src/server/routes-vacancies.js',
    'js/tests/vacancy-history.test.js', 'js/tests/vacancy-controls.test.js',
    'js/tests/job-vacancy-cache-durability.test.js', 'js/tests/vacancy-legacy.test.js',
    'js/tests/helpers/e2e-vacancy-metadata.mjs',
    'experiments/issue-56/vacancy-history-before.py',
    'experiments/issue-56/vacancy-html-browser.mjs',
    'experiments/issue-56/vacancy-metadata-fixture.mjs',
    'experiments/issue-56/vacancy-metadata-mcp-server.mjs',
    'experiments/issue-56/collect-vacancy-history.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/vacancy-observation-history.md',
    *[f'js/src/web/locales/{locale}-vacancy.js' for locale in ['en', 'ru', 'zh', 'hi']],
    *[f'docs/screenshots/issue-56-vacancy-history/{name}.png' for name in ['before', 'after', 'phone']],
]
logs = [f'ci-logs/vacancy-history-{name}.log' for name in [
    'before', 'parent', 'after', 'deno', 'controls', 'native', 'mcp',
    'build', 'lint', 'format-check', 'secrets', 'diff',
]]
read = lambda name: (root / f'ci-logs/vacancy-history-{name}.log').read_text()
assert all(s in read('before') for s in ['tests 9', 'pass 1', 'fail 8'])
assert all(s in read('after') for s in ['tests 24', 'pass 24', 'fail 0'])
assert '24 passed | 0 failed' in read('deno')
assert all(s in read('controls') for s in ['tests 6', 'pass 6', 'fail 0'])
receipt = json.loads(read('native'))
assert receipt['observationHistory'] and receipt['cacheRetained']
assert receipt['opens'] == 7 and receipt['providerClicks'] == receipt['pageErrors'] == 0
assert receipt['liveProvider'] is False
closed = json.loads(read('mcp').splitlines()[-1])
assert closed['closed'] and closed['resourcesClosed'] and closed['providerClicks'] == 0
assert closed['liveProvider'] is False
for name in ['lint', 'secrets', 'diff']:
    assert not read(name).strip(), name
assert 'All matched files use Prettier code style!' in read('format-check')
entries = {name: (root / name).read_bytes() for name in [*paths, *logs]}
reference = json.loads((root / 'ci-logs/vacancy-cache-reference.json').read_text())
content = base64.b64decode(reference['content'])
assert hashlib.sha1(f'blob {len(content)}\0'.encode() + content).hexdigest() == reference['sha']
entries['references/vacancy-cache.mjs'] = content
entries['references/vacancy-cache.json'] = json.dumps(reference, indent=2).encode()
for name in ['js/src/assignments/vacancy.js', 'js/src/assignments/vacancy-content.js',
             'js/src/web/vacancies-panel.js']:
    entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent, parentFailures=8, parentControls=1,
    focusedChecks={'node': 24, 'deno': 24, 'ui': 6}, nativeReceipt=receipt,
    localFullSuite=False, liveProvider=False, mcpCleanConsole=False,
    exactSourceHostedVerificationRequired=True, acceptedInventoryRows=[], issueComplete=False), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/vacancy-observation-history.tar.gz', entries)
