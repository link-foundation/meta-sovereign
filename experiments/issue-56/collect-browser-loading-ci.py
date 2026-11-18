"""Preserve the two published CI failures and focused bounded correction."""
from pathlib import Path
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
checks = {
    'browser-partition-before.log': ['pass 6', 'fail 1', 'combines 5 native scenarios'],
    'browser-partition-after.log': ['pass 7', 'fail 0'],
    'changeset-count-before.log': ['Found 2 changeset', 'Multiple changesets'],
    'changeset-count-worktree.log': ['Found 1 changeset', 'Changeset validation passed'],
}
for name, fragments in checks.items():
    text = (root / 'ci-logs' / name).read_text()
    assert all(fragment in text for fragment in fragments), name
assert not (root / 'ci-logs/browser-partition-lint.log').read_text().strip()
names = [
    'js/tests/e2e-vacancies-browser.mjs',
    'js/tests/e2e-vacancy-loading-browser.mjs',
    'js/tests/ci-browser-shards.test.js', 'js/scripts/browser-checks.json',
    'js/scripts/browser-check-shards.mjs', 'js/scripts/validate-changeset.mjs',
    'package.json', '.changeset/visible-browser-defaults.md',
    'docs/case-studies/issue-56/browser-loading-ci.md',
    'experiments/issue-56/collect-browser-loading-ci.py',
    'experiments/issue-56/evidence_bundle.py',
]
logs = [*checks, 'browser-partition-lint.log', 'browser-partition-format.log',
        'workflow-contracts-134661799617.log', 'changesets-134661799666.log',
        'pipeline-status-134663605548.log', 'checks-3ff4d3e2.json']
names += [f'ci-logs/{name}' for name in logs]
write_entries_archive(root / 'docs/case-studies/issue-56/data/browser-loading-ci.tar.gz',
                      {name: (root / name).read_bytes() for name in names})
