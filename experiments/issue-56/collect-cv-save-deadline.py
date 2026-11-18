"""Preserve finite actual-parent and corrected CV Save deadline evidence."""
import json
import subprocess
from evidence_bundle import changed_sources, evidence_context, evidence_logs, write_entries_archive

root, logs, read = evidence_context(__file__, 'cv-save-deadline')
parent = subprocess.check_output(['git', 'rev-parse', '08cf9ee5'], cwd=root).decode().strip()
for name, fragments in {
    'cycle-before': ['pass 2', 'fail 9'],
    'parent-replay': ['expected actual-parent failure'],
    'focused': ['pass 54', 'fail 0', 'skipped 0'],
    'format-check': ['All matched files use Prettier code style!'],
    'limits': ['0 over the 1500 line limit'],
    'doc-limits': ['All documentation files are within'],
}.items():
    assert all(fragment in read(name) for fragment in fragments), name
for name in ['secrets', 'diff']:
    assert not read(name).strip(), name
lint = read('lint')
assert '0 errors, 1 warning' in lint and 'complexity of 21' in lint
names = [*changed_sources(root), *evidence_logs(root, 'cv-save-deadline'),
         'experiments/issue-56/parent_replay.py', 'experiments/issue-56/evidence_bundle.py',
         'experiments/issue-56/cv-created-workplace-fixture.mjs',
         'experiments/issue-56/cv-watch-fixture.mjs']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
entries['before/js/src/jobs/cv-save-cycle.js'] = subprocess.check_output(
    ['git', 'show', f'{parent}:js/src/jobs/cv-save-cycle.js'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'implementationParent': parent, 'parentFailures': 9,
    'parentIndependentControls': 2, 'newChecks': 11, 'focusedPassed': 54,
    'localConcurrency': 1, 'nodeHeapMiB': 384,
    'retainedLintWarnings': 1, 'remainingOriginalCriteria': 30,
    'issueComplete': False, 'hostedVerification': 'pending publication',
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/cv-save-deadline.tar.gz', entries)
