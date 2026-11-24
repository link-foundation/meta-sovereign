"""Bind private-cache migration to actual-parent and focused shared checks."""
import base64
import hashlib
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
parent = '997b0dd2e1c7297a6ab4db17e7a4421aa1e38094'
production = ['js/src/assignments/vacancy.js', 'js/src/jobs/service.js',
              'js/src/jobs/technology-service.js']
paths = [*production,
    *[f'js/src/assignments/vacancy-legacy-{kind}.js' for kind in ['cache', 'content', 'write']],
    'js/src/assignments/vacancy-content.js', 'js/src/assignments/validation.js',
    'js/src/forms/private-source.js', 'js/src/storage/acknowledged-record.js',
    'js/src/storage/app-directory.js', 'js/src/storage/causal-writes.js',
    'js/src/web/vacancy-api.js', 'js/src/server/routes-vacancies.js',
    'js/src/cli/vacancy-commands.js', 'js/tests/vacancy-legacy.test.js',
    'js/tests/vacancy-html.test.js', 'js/tests/job-vacancy-cache-durability.test.js',
    'experiments/issue-56/vacancy-legacy-fixture.mjs',
    'experiments/issue-56/vacancy-legacy-before.py',
    'experiments/issue-56/collect-vacancy-legacy.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/vacancy-legacy-cache.md',
]
logs = [f'ci-logs/vacancy-legacy-{name}.log' for name in [
    'before', 'parent', 'after', 'deno', 'lint', 'format-check', 'secrets', 'diff',
    'fixture-json-escape-failure', 'initial-admission-assertion',
]]
before = (root / logs[0]).read_text()
assert all(value in before for value in ['tests 13', 'pass 1', 'fail 12'])
after = (root / logs[2]).read_text()
assert all(value in after for value in ['tests 32', 'pass 32', 'fail 0'])
assert '32 passed | 0 failed' in (root / logs[3]).read_text()
for name in ['lint', 'secrets', 'diff']:
    assert not (root / f'ci-logs/vacancy-legacy-{name}.log').read_text().strip()
assert 'All matched files use Prettier code style!' in (root / logs[5]).read_text()
entries = {name: (root / name).read_bytes() for name in [*paths, *logs]}
references = {}
for tag in ['vacancy-cache', 'vacancy-legacy-cv']:
    name = f'ci-logs/{tag}-reference.json'
    reference = json.loads((root / name).read_text())
    content = base64.b64decode(reference['content'])
    assert hashlib.sha1(f'blob {len(content)}\0'.encode() + content).hexdigest() == reference['sha']
    assert 'fa0991b8c2d0896fb3b4be6c69947f0590094b15' in reference['html_url']
    entries[name] = (root / name).read_bytes()
    entries[f'references/{reference["path"]}'] = content
    references[reference['path']] = dict(url=reference['html_url'], blob=reference['sha'])
for name in production:
    entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent, referenceContracts=references,
    parentFailures=12, parentControls=1, focusedChecks=32, runtimeChecks=['node', 'deno'],
    liveProvider=False, localFullSuite=False, browserChanges=False,
    acceptedInventoryRows=[], issueComplete=False), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/vacancy-legacy-cache.tar.gz', entries)
