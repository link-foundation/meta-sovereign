"""Preserve the exact serial deadline failures without claiming hosted success."""
import hashlib
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
read = lambda name: (logs / name).read_text()
parent = 'b3364503e8bfb4989659e0f4a7fc7de57edbff1c'
hosted = 'ci-logs/hosted-b3364503-webkit-4-attempt-1.log'
text = (root / hosted).read_text()
assert 'Completed vacancies in 180168ms; exit 1' in text
assert 'ETIMEDOUT' in text and 'Browser check: vacancy-discovery' in text
assert 'The operation was canceled.' in text
attempt = json.loads(read('b3364503-checks-attempt-1.json'))
assert attempt['headSha'] == parent and attempt['conclusion'] == 'failure'
assert 'ℹ pass 0' in read('ci-browser-budget-parent.log')
assert 'ℹ fail 2' in read('ci-browser-budget-parent.log')
assert 'ℹ pass 29' in read('ci-browser-budget-focused.log')
assert 'ℹ fail 0' in read('ci-browser-budget-focused.log')
assert '[e2e-vacancy-selection] OK (webkit)' in read('ci-browser-budget-selection.log')
assert '"providerClicks":0,"pageErrors":[]' in read('ci-browser-budget-selection.log')
for gate in ['lint', 'secrets', 'whitespace']:
    assert not read(f'ci-browser-budget-{gate}.log').strip(), gate
assert 'All workflows enforce runner, deadline and checkout policy' in read(
    'ci-browser-budget-workflow.log')
assert 'All matched files use Prettier code style!' in read(
    'ci-browser-budget-format-check.log')
assert '0 over the 1500 line limit' in read('ci-browser-budget-source-limits.log')
assert 'All documentation files are within' in read('ci-browser-budget-doc-limits.log')
sources = [
    '.github/workflows/release.yml', 'package.json', 'js/scripts/browser-checks.json',
    'js/scripts/browser-check-shards.mjs', 'js/scripts/run-browser-checks.mjs',
    'js/tests/ci-browser-shards.test.js', 'js/tests/ci-contracts.test.js',
    'js/tests/e2e-vacancies-browser.mjs', 'js/tests/e2e-vacancy-selection-browser.mjs',
    'js/tests/helpers/e2e-vacancy-selection.mjs',
    'js/tests/helpers/e2e-browser-scenarios.mjs',
    'experiments/issue-56/vacancy-selection-browser.mjs',
    'experiments/issue-56/vacancy-browser-fixture.mjs',
    'experiments/issue-56/collect-ci-browser-budget.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/ci-browser-budget.md',
    'docs/case-studies/issue-56/README.md', 'PLAN.md', hosted,
    'ci-logs/b3364503-checks-attempt-1.json',
    'ci-logs/b3364503-pipeline-attempt-1.log',
]
for lane in ['webkit-4', 'deno-3', 'deno-6', 'bun']:
    name = f'ci-logs/b3364503-cancelled-{lane}-annotations.json'
    annotations = json.loads((root / name).read_text())
    message = 'maximum execution time' if lane == 'webkit-4' else 'not acquired'
    assert any(message in row['message'] for row in annotations), lane
    sources += [name, f'ci-logs/b3364503-cancelled-{lane}-job.json']
sources += [str(path.relative_to(root)) for path in logs.glob('ci-browser-budget-*.log')
            if not path.name.endswith(('-archive.log', '-commit.log', '-push.log'))]
entries = {name: (root / name).read_bytes() for name in sorted(set(sources))}
for name in sources[:5] + ['js/tests/e2e-vacancies-browser.mjs']:
    entries['before/' + name] = subprocess.check_output(
        ['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(
    parent=parent, run=44328438761, attempt=1, job=134889666218,
    accepted=False, verified=88, unfinished=30, tests=29,
    browserMatrixHostedOnly=True, deadlinesChanged=False,
    sources={name: hashlib.sha256((root / name).read_bytes()).hexdigest()
             for name in sources[:18]},
), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-browser-budget.tar.gz', entries)
