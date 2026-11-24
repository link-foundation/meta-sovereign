"""Retain exact-parent failures, pinned sources and finite persisted-read checks."""
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert '# pass 2' in (logs / 'vk-legacy-priority-before.log').read_text()
assert '# fail 3' in (logs / 'vk-legacy-priority-before.log').read_text()
assert '# pass 5' in (logs / 'vk-legacy-priority-after.log').read_text()
assert '# fail 0' in (logs / 'vk-legacy-priority-after.log').read_text()
assert 'pass 24' in (logs / 'vk-legacy-priority-focused.log').read_text()
assert 'fail 0' in (logs / 'vk-legacy-priority-focused.log').read_text()
assert not (logs / 'vk-legacy-priority-lint.log').read_text().strip()
sources = [f'js/src/automation/vk-{name}-settings.js'
           for name in ('friends', 'maintenance', 'personal')]
names = [
    *sources, 'js/tests/vk-legacy-priorities.test.js',
    'experiments/issue-56/legacy-priority-before.py',
    'experiments/issue-56/collect-legacy-priorities.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/legacy-priorities.md',
    *[f'ci-logs/vk-legacy-priority-{suffix}.log' for suffix in (
        'before', 'after', 'focused', 'lint', 'web-build', 'before-helper',
        'import-error', 'close-fixture-error')],
    *[f'ci-logs/vk-desktop-reference-{name}.source' for name in (
        'list-values', 'config', 'list-values.test')],
]
entries = {name: (root / name).read_bytes() for name in names}
for name in sources:
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'3e70de44:{name}'], cwd=root)
entries['metadata.json'] = b'{"issue_complete":false,"before":"3e70de44","focused_checks":29,"provider_live":false}\n'
write_entries_archive(root / 'docs/case-studies/issue-56/data/legacy-priorities.tar.gz', entries)
