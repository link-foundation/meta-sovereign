"""Preserve a non-reproducing packaged timeout without claiming its cause."""
import json
from evidence_bundle import evidence_context, write_entries_archive

root, logs, read = evidence_context(__file__, 'desktop-drain-trace')
assert all(value in read('focused') for value in ['tests 11', 'pass 11', 'fail 0'])
assert all(value in read('enabled') for value in ['stop_pending', 'stop_settled', 'pass 1', 'fail 0'])
for name in ['lint', 'secrets', 'diff']:
    assert not read(name).strip(), name
names = [
    'js/src/server/shutdown-trace.js', 'js/src/server/runtime-lifecycle.js',
    'js/src/server/index.js', 'js/src/server/background-jobs.js',
    'js/tests/server-resource-release.test.js', 'js/tests/desktop-lifecycle.test.js',
    'js/tests/desktop-packaged-launch.test.js',
    'experiments/issue-56/collect-desktop-drain-trace.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/desktop-drain-investigation.md',
    'ci-logs/desktop-macos-134599326077.log',
    'ci-logs/desktop-macos-134603908343.log',
] + [f'ci-logs/desktop-drain-trace-{name}.log' for name in ['focused', 'enabled', 'lint', 'secrets', 'diff']]
entries = {name: (root / name).read_bytes() for name in names}
entries['metadata.json'] = (json.dumps(dict(
    failingParent='802c6168fb696f9aee056b4785b09649b8a1b01e',
    passingUnmodifiedRun='13788383fe6d9183dbf662bf3d25563777b1e34b',
    focusedPasses=11, causeProven=False, issueFixed=False,
    defaultSilent=True, timeoutUnchanged=True,
    acceptedCriteria=86, unfinishedCriteria=32, issueComplete=False), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/desktop-drain-trace.tar.gz', entries)
