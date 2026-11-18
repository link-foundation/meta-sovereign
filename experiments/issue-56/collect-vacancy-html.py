"""Preserve exact-parent HTML loss and bounded shared-path verification."""
from pathlib import Path
import base64
import hashlib
import json
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
parent = '1f0c7287b7869c2a41fea826c84723607d3156dd'
production = ['js/src/assignments/vacancy-reader.js',
              'js/src/assignments/vacancy-content.js',
              'js/src/jobs/technology-analysis.js']
sources = [
    *production, 'js/src/assignments/validation.js', 'js/src/assignments/vacancy.js',
    'js/src/web/vacancy-api.js', 'js/src/web/vacancies-panel.js',
    'js/src/web/app.min.js', 'js/src/cli/vacancy-commands.js',
    'js/tests/vacancy-html.test.js', 'js/tests/helpers/e2e-vacancy-metadata.mjs',
    'js/tests/e2e-vacancies-browser.mjs',
    'experiments/issue-56/vacancy-metadata-fixture.mjs',
    'experiments/issue-56/vacancy-browser-fixture.mjs',
    'experiments/issue-56/vacancy-fixture.mjs',
    'experiments/issue-56/vacancy-html-before.py',
    'experiments/issue-56/vacancy-html-browser.mjs',
    'experiments/issue-56/collect-vacancy-html.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/vacancy-html.md',
    'ci-logs/vacancy-insights-reference.mjs',
    'ci-logs/vacancy-html-reference.json',
    'ci-logs/private-resume-reference-contract.md',
]
logs = [f'ci-logs/vacancy-html-{name}.log' for name in [
    'before', 'parent-probe', 'focused', 'browser-before', 'browser-after',
    'build', 'lint', 'format-check', 'secrets', 'diff', 'source-limits', 'doc-limits',
]]
before = (root / logs[0]).read_text()
assert all(value in before for value in ['tests 17', 'pass 2', 'fail 15'])
assert 'actual: undefined' in (root / logs[3]).read_text()
focused = (root / logs[2]).read_text()
assert all(value in focused for value in ['tests 31', 'pass 31', 'fail 0'])
receipt = json.loads((root / logs[4]).read_text())
assert receipt == dict(variants=4, htmlRefusals=2, exactDescriptionHtml=True,
    opens=7, cacheRetained=True, providerClicks=0, pageErrors=0, liveProvider=False)
for name in ['lint', 'secrets', 'diff']:
    assert not (root / f'ci-logs/vacancy-html-{name}.log').read_text().strip()
assert 'All matched files use Prettier code style!' in (root / logs[7]).read_text()
reference = json.loads((root / 'ci-logs/vacancy-html-reference.json').read_text())
original = base64.b64decode(reference['content'])
assert original == (root / 'ci-logs/vacancy-insights-reference.mjs').read_bytes()
assert hashlib.sha1(f'blob {len(original)}\0'.encode() + original).hexdigest() == reference['sha']
entries = {name: (root / name).read_bytes() for name in [*sources, *logs]}
for name in production:
    entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent,
    reference='konard/hh-job-application-automation@fa0991b8c2d0896fb3b4be6c69947f0590094b15',
    nativeReceipt=receipt, namedChecks=17, parentFailures=15, parentControls=2,
    focusedChecks=31, localFullMatrix=False, acceptedInventoryRows=[],
    liveProvider=False, issueComplete=False), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/vacancy-html.tar.gz', entries)
