"""Preserve strict native host-pacing regressions and the real hosted failure."""
import json
import subprocess
from evidence_bundle import evidence_context, evidence_logs, verify_evidence, write_entries_archive

root, logs, read = evidence_context(__file__, 'lychee-host-pacing')
verify_evidence(read, {
    'before': ['Ran 4 tests', 'FAILED (failures=1)', '"peak": 4'],
    'focused': ['Ran 4 tests', '\nOK\n', '"peak": 1'],
    'remote': ['8 OK', '0 Errors'],
    'format-check': ['All matched files use Prettier code style!'],
    'source-limits': ['0 over the 1500 line limit'],
    'doc-limits': ['All documentation files are within the 2500 line limit.'],
}, empty=('secrets', 'diff'))
assert 'tar.gz: OK' in (logs / 'lychee-native-download.log').read_text()
sources = [
    'lychee.toml', '.github/workflows/links.yml',
    'experiments/issue-56/lychee-host-pacing.py',
    'experiments/issue-56/collect-lychee-host-pacing.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/ci-github-pacing.md',
    'ci-logs/448c2234-links-failed.log', 'ci-logs/6f7bdd6f-link-recheck.json',
    'ci-logs/lychee-native-download.log', 'ci-logs/lychee-release-assets.json',
    'ci-logs/lychee-action-pinned.yml', 'ci-logs/lychee-pinned-config.toml',
    'ci-logs/lychee-pinned-website.rs',
    'ci-logs/lychee-pinned-lychee-lib-src-ratelimit-host-host.rs',
    'ci-logs/lychee-pinned-lychee-lib-src-ratelimit-config.rs',
    'ci-logs/lychee-pinned-lychee-lib-src-retry.rs',
    *evidence_logs(root, 'lychee-host-pacing'),
]
entries = {name: (root / name).read_bytes() for name in sorted(set(sources))}
parent = subprocess.check_output(['git', 'rev-parse', '6ddfac17'], cwd=root).decode().strip()
name = '.github/workflows/links.yml'
entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(
    parent=parent, binaryVersion='0.24.2', nativeChecks=4, beforeFailures=1,
    remoteUrlsChecked=8, liveProvider=False, acceptance=False,
    acceptedCriteria=83, unfinishedCriteria=35, hostedVerificationPending=True,
), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/lychee-host-pacing.tar.gz', entries)
