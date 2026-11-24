"""Retain the actual release gate failure and unchanged-validator correction."""
import subprocess
from evidence_bundle import evidence_context, write_entries_archive

root, logs, read = evidence_context(__file__, 'runner-changeset')
assert 'Multiple changesets found in this PR (4)' in read('before')
assert 'Found 1 changeset' in read('after')
assert 'Changeset validation passed' in read('after')
assert 'Multiple changesets found in this PR (2)' in read('hosted')
names = [
    '.changeset/visible-browser-defaults.md',
    'docs/case-studies/issue-56/runner-release-notes.md',
    'experiments/issue-56/collect-runner-release-notes.py',
    'js/scripts/merge-changesets.mjs', 'js/scripts/validate-changeset.mjs',
    'ci-logs/runner-ui-adb-jobs.json',
    *[f'ci-logs/runner-changeset-{name}.log' for name in (
        'before', 'after', 'merge', 'hosted',
    )],
]
entries = {name: (root / name).read_bytes() for name in names}
for name in ['visible-browser-defaults', 'runner-session-control',
             'runner-session-api', 'runner-session-controls']:
    path = f'.changeset/{name}.md'
    entries[f'before/{path}'] = subprocess.check_output(
        ['git', 'show', f'29a47168:{path}'], cwd=root)
write_entries_archive(
    root / 'docs/case-studies/issue-56/data/runner-release-notes.tar.gz', entries)
