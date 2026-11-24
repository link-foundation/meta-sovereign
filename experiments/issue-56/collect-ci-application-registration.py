"""Preserve the actual registration refusal and unchanged strict browser gates."""
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'fail 1' in (logs / 'ci-application-registration-parent.log').read_text()
assert 'pass 5' in (logs / 'ci-application-registration-final.log').read_text()
assert 'fail 0' in (logs / 'ci-application-registration-final.log').read_text()
assert not (logs / 'ci-application-registration-lint.log').read_text().strip()
hosted = (logs / 'hosted-7d105-workflow-contracts.log').read_text()
assert 'native application scenarios remain registered once in bounded groups' in hosted
assert 'Process completed with exit code 1' in hosted
names = [
    'package.json', 'js/scripts/browser-checks.json',
    'js/tests/e2e-job-application-browser.mjs',
    'js/tests/e2e-job-application-answers-browser.mjs',
    'js/tests/ci-browser-shards.test.js',
    'js/tests/helpers/e2e-application-answer-approval.mjs',
    'experiments/issue-56/collect-ci-application-registration.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/ci-application-registration.md',
]
entries = {name: (root / name).read_bytes() for name in names}
for name in names[:3] + ['js/tests/ci-browser-shards.test.js']:
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'7d105671:{name}'], cwd=root)
for name in ['parent', 'final', 'lint', 'format']:
    path = logs / f'ci-application-registration-{name}.log'
    entries[str(path.relative_to(root))] = path.read_bytes()
entries['ci-logs/hosted-7d105-workflow-contracts.log'] = hosted.encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-application-registration.tar.gz', entries)
