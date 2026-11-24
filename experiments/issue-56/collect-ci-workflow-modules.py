"""Preserve the published workflow limit and unchanged documentation gates."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import evidence_logs, write_entries_archive, verify_evidence

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
prefix = 'ci-workflow-modules'
verify_evidence(lambda name: (logs / f'{prefix}-{name}.log').read_text(), {
    'replay': ['"lines": 1506, "code": 1', '"lines": 1458, "code": 0',
               'six bounded documentation gate comparisons pass.'],
    'node': ['pass 2', 'fail 0'],
    'deno': ['2 passed | 0 failed'],
    'format': ['All matched files use Prettier code style!'],
    'workflow-lint': ['No findings to report.'],
    'limits': ['0 over the 1500 line limit'],
}, empty=('secrets', 'diff'))
job = json.loads((logs / '9846a827-line-limits-job.json').read_text())
assert job['conclusion'] == 'failure' and job['head_sha'].startswith('9846a827')
assert 'File has 1506 lines' in (logs / 'hosted-9846a827-line-limits.log').read_text()
names = [
    '.github/workflows/release.yml', 'js/scripts/check-doc-line-limits.sh',
    'js/scripts/check-required-docs.sh', 'js/scripts/check-file-line-limits.sh',
    'experiments/issue-56/ci-workflow-modules.py',
    'experiments/issue-56/collect-ci-workflow-modules.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/ci-workflow-modules.md',
    'ci-logs/9846a827-line-limits-job.json',
    'ci-logs/hosted-9846a827-line-limits.log',
    'ci-logs/9846a827-main-current.json',
    'ci-logs/9846a827-workflows-final.json',
    *evidence_logs(root, prefix),
]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
entries['before/.github/workflows/release.yml'] = subprocess.check_output(
    ['git', 'show', '9846a827:.github/workflows/release.yml'], cwd=root)
entries['metadata.json'] = json.dumps(dict(source='9846a827', acceptance=False,
    beforeLines=1506, afterLines=1458, gateComparisons=6,
    nodeChecks=2, denoChecks=2, unchangedLimits=True)).encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-workflow-modules.tar.gz', entries)
