"""Preserve the native retry defect, corrected controls and exact failed CI."""
import json
import subprocess
from evidence_bundle import evidence_context, evidence_logs, verify_evidence, write_entries_archive

root, logs, read = evidence_context(__file__, 'lychee-transient')
verify_evidence(read, {
    'before': ['Ran 6 tests', 'FAILED (failures=4)', '"requests": [503],'],
    'focused': ['Ran 6 tests', '\nOK\n', '"requests": [503, 503, 503]'],
    'pacing': ['Ran 4 tests', '\nOK\n', '"peak": 1'],
    'remote': ['11 OK', '0 Errors'],
    'report': ['tests 1', 'pass 1', 'fail 0', 'cancelled 0', 'skipped 0'],
    'format-check': ['All matched files use Prettier code style!'],
    'source-limits': ['0 over the 1500 line limit'],
    'doc-limits': ['All documentation files are within the 2500 line limit.'],
}, empty=('secrets', 'diff'))
sources = [
    '.github/workflows/links.yml', 'lychee.toml',
    'experiments/issue-56/lychee-transient-retry.py',
    'experiments/issue-56/lychee-host-pacing.py',
    'experiments/issue-56/recheck-transient-links.py',
    'experiments/issue-56/collect-lychee-transient.py',
    'experiments/issue-56/evidence_bundle.py',
    'js/scripts/lychee-report.mjs', 'js/tests/lychee-report.test.js',
    'docs/case-studies/issue-56/ci-transient-retry.md',
    'ci-logs/2769b823-links-failed.log',
    'ci-logs/lychee-action-pinned.yml', 'ci-logs/lychee-pinned-status.rs',
    'ci-logs/lychee-pinned-lychee-lib-src-retry.rs',
    'ci-logs/lychee-nightly-retry.source',
    'ci-logs/lychee-nightly-release.json', 'ci-logs/lychee-nightly-tag.json',
    'ci-logs/lychee-nightly-version.log', 'ci-logs/lychee-release-assets.json',
    'ci-logs/lychee-retry-issue2319.json', 'ci-logs/lychee-retry-pr2324.json',
    *evidence_logs(root, 'lychee-transient'),
]
entries = {name: (root / name).read_bytes() for name in sorted(set(sources))}
parent = subprocess.check_output(['git', 'rev-parse', '9121743a'], cwd=root).decode().strip()
workflow = '.github/workflows/links.yml'
entries[f'before/{workflow}'] = subprocess.check_output(
    ['git', 'show', f'{parent}:{workflow}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(
    parent=parent, failedHead='2769b823e04638a0a3f6ebc2f0cac2beb26ccbbc',
    failedRun=44171573167, nativeChecks=6, stableFailures=4, pacingChecks=4,
    remoteUrlsChecked=11, nightlySource='f10ac2774dac100dfdbf014647487520a8ffe08d',
    nightlyAsset=744397476,
    nightlySha256='320b6cd1e624d3d421fe3481b39427689e20b6ad65a2e3171fa0b7e19ac7a82e',
    acceptance=False, acceptedCriteria=83, unfinishedCriteria=35,
    hostedVerificationPending=True,
), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/lychee-transient.tar.gz', entries)
