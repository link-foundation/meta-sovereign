"""Verify exact failed hosted grouping and the unchanged execution contracts."""
import hashlib
import runpy
from pathlib import Path

root = Path(__file__).resolve().parents[2]
evidence = runpy.run_path(str(root / 'experiments/issue-56/evidence_bundle.py'))
_, _, read = evidence['evidence_context'](__file__, 'ci-vacancy-groups')
assert 'vacancies combines 5 native scenarios' in read('parent')
hosted = (root / 'ci-logs/checks-44022664526-133837402279.log').read_text()
assert 'ETIMEDOUT' in hosted and 'Completed vacancies in 180215ms; exit 1' in hosted
assert '"scenario":"verifyVacancyMetadataVariants","phase":"started"' in hosted
evidence['verify_evidence'](read, {
    'focused-final': ['pass 26', 'fail 0', 'skipped 0'],
    'native-final': ['"resourcesClosed":true', '"providerClicks":0',
                     '[e2e-vacancy-discovery] OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
})
sources = evidence['changed_sources'](root)
evidence['bundle'](root, [*sources,
    *evidence['evidence_logs'](root, 'ci-vacancy-groups'),
    'ci-logs/checks-44022664526-133837402279.log',
    'ci-logs/checks-44022664526-133837402279.json',
    'ci-logs/ci-macos-cleanup-webkit-vacancies.zip',
    'ci-logs/ci-macos-cleanup-webkit-vacancies.log',
    'ci-logs/ci-macos-cleanup-webkit-summary.json',
], 'docs/case-studies/issue-56/data/ci-vacancy-browser-groups.tar.gz', {
    'acceptance': False, 'parentFailures': 1, 'focusedTests': 26,
    'nativeScenarios': 2,
    'pending': 'Exact-head hosted validation and all 40 unchecked criteria',
    'sourceHashes': {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                     for name in sources},
}, 'no-ci-vacancy-groups-screenshots', before={
    'package.json': '215b1fee',
    'js/scripts/browser-checks.json': '215b1fee',
    'js/tests/e2e-vacancies-browser.mjs': '215b1fee',
    'js/tests/ci-browser-shards.test.js': '215b1fee',
})
