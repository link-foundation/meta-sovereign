"""Preserve the actual closed-panel failure and finite native reproduction."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
read = lambda name: (logs / f'question-reload-{name}.log').read_text()
parent = subprocess.check_output(['git', 'rev-parse', '72dc9552'], cwd=root).decode().strip()
job = json.loads((logs / 'hosted-72dc9552-webkit-7-job.json').read_text())
assert job['head_sha'] == parent and job['conclusion'] == 'failure'
hosted = (logs / 'hosted-72dc9552-webkit-7.log').read_text()
assert "name: 'Где вы живете?', exact: true" in hosted
assert 'locator.click: Timeout 30000ms exceeded.' in hosted
assert '[e2e-questions] FAIL (chromium)' in read('parent')
assert 'locator.click: Timeout 3000ms exceeded.' in read('parent')
assert '"restoredOpen":true,"rules":1' in read('parent')
assert '"persistedQuestion":true,"persistedAnswer":true,"persistedEquivalent":true,"open":true,"providerSends":0' in read('current')
assert '[e2e-questions] OK (chromium)' in read('current')
for name in ['lint', 'secrets', 'diff']:
    assert not read(name).strip(), name
assert 'All matched files use Prettier code style!' in read('format-check')
names = ['js/tests/e2e-questions-browser.mjs',
    'js/tests/helpers/question-preview.mjs', 'js/tests/helpers/e2e-chat.mjs',
    'js/tests/helpers/e2e-input-trace.mjs',
    'experiments/issue-56/question-reload-disclosure.mjs',
    'experiments/issue-56/collect-question-reload-disclosure.py',
    'experiments/issue-56/previous-module.mjs',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/ci-question-reload-disclosure.md',
    'docs/screenshots/issue-56-question-reload/before.png',
    'docs/screenshots/issue-56-question-reload/after.png']
names += [f'ci-logs/question-reload-{tag}.log'
    for tag in ['parent', 'current', 'lint', 'secrets', 'diff', 'format-check']]
names += [f'ci-logs/hosted-72dc9552-webkit-7{tag}'
    for tag in ['.log', '-job.json', '-annotations.json']]
names += ['ci-logs/72dc9552-webkit-7-artifacts/summary.json',
          'ci-logs/question-reload-parent/ms-e2e-questions-chromium.png',
          'ci-logs/question-reload-parent-open.png']
entries = {name: (root / name).read_bytes() for name in names}
entries['before/js/tests/e2e-questions-browser.mjs'] = subprocess.check_output(
    ['git', 'show', f'{parent}:js/tests/e2e-questions-browser.mjs'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent,
    run=44348205096, job=134960472696, parentFails=True, focusedPasses=True,
    productChanged=False, liveProvider=False, acceptance=False,
    acceptedCriteria=88, unfinishedCriteria=30), indent=2) + '\n').encode()
write_entries_archive(root /
    'docs/case-studies/issue-56/data/question-reload-disclosure.tar.gz', entries)
