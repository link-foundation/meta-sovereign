"""Bind the duplication failure and unchanged-policy correction to actual bytes."""
from pathlib import Path
import json
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
parent = 'b02d90823ce6fb8e3309a8e622efa01d7cfeda0c'
names = subprocess.check_output(['git', 'diff', '--name-only'], cwd=root, text=True).splitlines()
names += [
    'experiments/issue-56/application-hold-fixture.mjs',
    'js/tests/helpers/application-native-guard.mjs',
    'js/tests/helpers/e2e-legacy-follow.mjs',
    'experiments/issue-56/collect-ci-shared-fixtures.py',
    'docs/case-studies/issue-56/ci-shared-application-fixtures.md',
    '.jscpd.json',
    'ci-logs/checks-44232242988.log',
    'ci-logs/hosted-b02d9082-134560181010.log',
    'ci-logs/hosted-b02d9082-134561617920.log',
    *[f'ci-logs/hosted-verification-b02d9082-{label}.json' for label in ['checks', 'desktop', 'links', 'pages', 'security']],
    *[f'ci-logs/ci-duplication-{label}.log' for label in ['after', 'focused', 'native', 'holds-native', 'follow-native', 'lint', 'format-check']],
    *[f'ci-logs/{name}-before.log' for name in ['application-resume-visibility', 'vacancy-search-url', 'vacancy-history']],
]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in names:
    if name.startswith(('experiments/', 'js/')) and subprocess.run(
        ['git', 'cat-file', '-e', f'{parent}:{name}'], cwd=root,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
assert json.loads(entries['.jscpd.json'])['threshold'] == 6.5
assert 'pass 17' in entries['ci-logs/ci-duplication-focused.log'].decode()
assert 'fail 0' in entries['ci-logs/ci-duplication-focused.log'].decode()
assert 'ERROR:' not in entries['ci-logs/ci-duplication-after.log'].decode()
assert not entries['ci-logs/ci-duplication-lint.log'].strip()
assert 'All matched files use Prettier code style!' in entries['ci-logs/ci-duplication-format-check.log'].decode()
for label in ['checks', 'desktop', 'links', 'pages', 'security']:
    run = json.loads(entries[f'ci-logs/hosted-verification-b02d9082-{label}.json'])
    assert run['headSha'] == parent and run['status'] == 'completed'
    assert run['conclusion'] == ('failure' if label == 'checks' else 'success')
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-shared-fixtures.tar.gz', entries)
