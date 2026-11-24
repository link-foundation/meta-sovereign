"""Preserve finite command regressions and the actual hosted detach failure."""
import hashlib
import runpy
from pathlib import Path

root = Path(__file__).resolve().parents[2]
evidence = runpy.run_path(str(root / 'experiments/issue-56/evidence_bundle.py'))
_, _, read = evidence['evidence_context'](__file__, 'ci-macos-cleanup')
assert 'pass 0' in read('parent') and 'fail 4' in read('parent')
hosted = (root / 'ci-logs/checks-44022664278-133835901747.log').read_text()
assert 'satisfies its Designated Requirement' in hosted
assert 'Resource busy' in hosted and 'exit code 16' in hosted
evidence['verify_evidence'](read, {
    'focused-final': ['pass 31', 'fail 0', 'skipped 0'],
    'format-check': ['All matched files use Prettier code style!'],
}, empty=('lint-final', 'secrets', 'diff', 'shell'))
sources = evidence['changed_sources'](root)
evidence['bundle'](root, [*sources,
    *evidence['evidence_logs'](root, 'ci-macos-cleanup'),
    'ci-logs/checks-44022664278-133835901747.log',
    'ci-logs/checks-44022664526-133837402167.log',
    'ci-logs/checks-44022664526-133837402167.json',
], 'docs/case-studies/issue-56/data/ci-macos-image-cleanup.tar.gz', {
    'acceptance': False, 'parentFailures': 4, 'focusedTests': 31,
    'localDiskImagesMounted': 0,
    'pending': 'Hosted macOS package verification and all 40 unchecked criteria',
    'sourceHashes': {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                     for name in sources},
}, 'no-ci-macos-cleanup-screenshots', before={
    '.github/workflows/desktop-release.yml': '13806114',
})
