"""Preserve the shared-process assertion failure without claiming a worker leak fix."""
import subprocess
from evidence_bundle import (
    changed_sources, evidence_context, evidence_logs,
    write_entries_archive,
)

root, logs, read = evidence_context(__file__, 'snapshot-observer')
checks = {
    'parent': ['ℹ tests 4', 'ℹ pass 2', 'ℹ fail 2'],
    'focused': ['ℹ tests 6', 'ℹ pass 6', 'ℹ fail 0'],
    'bun': ['6 pass', '0 fail', '[storage-snapshot] released 90210'],
    'format-check': ['All matched files use Prettier code style!'],
}
assert all(fragment in read(name) for name, fragments in checks.items()
           for fragment in fragments)
assert all(not read(name).strip() for name in ['lint', 'secrets', 'whitespace'])
names = set(changed_sources(root))
names.update(evidence_logs(root, 'snapshot-observer'))
names.update({
    'ci-logs/b980-bun-macos-134820578729.log',
    'js/src/storage/snapshot-worker-control.js',
    'js/src/storage/doublets-mirror.js',
    'experiments/issue-56/previous-module.mjs',
    'experiments/issue-56/evidence_bundle.py',
})
entries = {name: (root / name).read_bytes() for name in sorted(names)}
file = 'js/tests/snapshot-worker-cancellation.test.js'
entries[f'before/{file}'] = subprocess.check_output(
    ['git', 'show', f'b98098b7d0b55d60557024eab21461068798641a:{file}'], cwd=root)
write_entries_archive(
    root / 'docs/case-studies/issue-56/data/ci-snapshot-observers.tar.gz', entries)
