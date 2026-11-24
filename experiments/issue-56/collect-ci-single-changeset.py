"""Preserve the actual PR release gate failure without archiving unrelated work."""
import subprocess
from evidence_bundle import evidence_context, write_entries_archive
root, logs, read = evidence_context(__file__, 'vk-changeset')
assert 'Multiple changesets' in read('before')
assert 'Found 1 changeset' in read('after')
assert 'Changeset validation passed' in read('after')
names = [
    '.changeset/visible-browser-defaults.md',
    'docs/case-studies/issue-56/ci-single-changeset.md',
    'experiments/issue-56/collect-ci-single-changeset.py',
    'ci-logs/checks-wall-132798716101.log',
    'ci-logs/checks-wall-132799449198.log',
    'ci-logs/vk-birthday-wall-head-jobs.json',
    'ci-logs/vk-birthday-current-runs.json',
    'ci-logs/vk-changeset-before.log', 'ci-logs/vk-changeset-after.log',
]
entries = {name: (root / name).read_bytes() for name in names}
for name in ['visible-browser-defaults.md', 'vk-wall-invitations.md']:
    path = f'.changeset/{name}'
    entries[f'before/{path}'] = subprocess.check_output(
        ['git', 'show', f'3badd29a:{path}'], cwd=root)
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-single-changeset.tar.gz', entries)
