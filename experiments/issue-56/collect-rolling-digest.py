"""Keep the actual macOS failure and finite ordered/bounded hashing proof."""
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
for name, count in [('focused', 10), ('cli', 2)]:
    text = (logs / f'rolling-digest-{name}.log').read_text()
    assert f'# pass {count}' in text and '# fail 0' in text
assert 'read concurrency was 1' in (logs / 'rolling-digest-before.log').read_text()
assert not (logs / 'rolling-digest-lint.log').read_text().strip()
assert not (logs / 'rolling-digest-diff.log').read_text().strip()
sources = ['js/src/server/rolling-release.js',
    'js/tests/rolling-release-digest.test.js', 'js/tests/rolling-release-copy.test.js',
    'js/tests/helpers/rolling-release-fixture.mjs',
    'js/tests/helpers/rolling-cli-readiness.mjs', 'js/tests/rolling-cli.test.js',
    'js/tests/rolling-cli-readiness.test.js']
names = [*sources, 'docs/case-studies/issue-56/rolling-digest.md',
    'experiments/issue-56/rolling-digest-before.py',
    'experiments/issue-56/collect-rolling-digest.py',
    'experiments/issue-56/evidence_bundle.py',
    'ci-logs/3a24-node-macos-shard3.log', 'ci-logs/3a24-final-jobs.json',
    *[str(p.relative_to(root)) for p in sorted(logs.glob('rolling-digest-*.log'))]]
entries = {name: (root / name).read_bytes() for name in names}
for name in ['js/src/server/rolling-release.js', 'js/tests/rolling-release-copy.test.js']:
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'65bc33ee:{name}'], cwd=root)
entries['metadata.json'] = b'{"issue_complete":false,"before":"65bc33ee","focused_checks":12,"hosted_macOS":"pending","read_limit":4}\n'
write_entries_archive(root / 'docs/case-studies/issue-56/data/rolling-digest.tar.gz', entries)
