"""Retain the unresolved Windows deadline and opt-in fixture diagnostics."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import evidence_logs, verify_evidence, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
prefix = 'cv-publication-tracing'
verify_evidence(lambda name: (logs / f'{prefix}-{name}.log').read_text(), {
    'node': ['pass 9', 'fail 0'],
    'bun': ['7 pass', '0 fail', '"phase":"wire-publish"'],
    'deno': ['7 passed | 0 failed'],
    'trace-final': ['pass 1', 'fail 0'],
    'format-check': ['All matched files use Prettier code style!'],
    'limits': ['0 over the 1500 line limit'],
    'workflow-lint': ['No findings to report.'],
}, empty=('lint-final', 'secrets', 'diff'))
job = json.loads((logs / '5f982b17-bun-windows-job.json').read_text())
assert job['head_sha'] == '5f982b1721a8a409c9aeff060b42830889e7323b'
assert job['conclusion'] == 'failure'
hosted = (logs / 'hosted-5f982b17-bun-windows.log').read_text()
assert 'error: test timed out after 20000ms' in hosted and ' 1 fail' in hosted
assert '6 pass' in (logs / 'cv-publication-bun-resume.log').read_text()
sources = [
    '.github/workflows/release.yml',
    'experiments/issue-56/cv-publication-fixture.mjs',
    'experiments/issue-56/cv-publication-trace.mjs',
    'js/tests/cv-publication-exports.test.js',
    'js/tests/cv-publication-trace.test.js',
]
names = [*sources, 'experiments/issue-56/collect-ci-publication-boundaries.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/ci-publication-boundaries.md',
    'ci-logs/hosted-5f982b17-bun-windows.log',
    'ci-logs/5f982b17-bun-windows-job.json',
    'ci-logs/5f982b17-main-current.json',
    'ci-logs/cv-publication-bun-resume.log', *evidence_logs(root, prefix)]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in sources:
    old = subprocess.run(['git', 'show', f'5f982b17:{name}'], cwd=root,
                         stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    if old.returncode == 0:
        entries[f'before/{name}'] = old.stdout
entries['metadata.json'] = json.dumps(dict(source=job['head_sha'],
    acceptance=False, causeEstablished=False, originalTestsReproduce=False,
    nodeChecks=9, bunChecks=7, denoChecks=7, unchangedDeadlines=True)).encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-publication-boundaries.tar.gz', entries)
