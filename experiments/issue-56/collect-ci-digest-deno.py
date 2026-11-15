"""Keep actual published failures and finite Deno descriptor re-entry evidence."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'read concurrency was 8' in (logs / 'digest-deno-before.log').read_text()
assert '7 !== 4' in (logs / 'digest-deno-before.log').read_text()
assert '2 passed | 0 failed' in (logs / 'digest-deno-after.log').read_text()
assert '# pass 2' in (logs / 'digest-node-after.log').read_text()
assert 'FileHandle.readFile' in (logs / 'digest-deno-read-trace.log').read_text()
names = ['js/tests/rolling-release-digest.test.js',
    'js/src/server/rolling-release.js',
    'js/tests/helpers/rolling-release-fixture.mjs',
    'experiments/issue-56/digest-deno-read-trace.mjs',
    'experiments/issue-56/collect-ci-digest-deno.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/ci-digest-deno.md',
    'ci-logs/runner-latest-runs.json', 'ci-logs/runner-b30-main-jobs.json',
    *[str(p.relative_to(root)) for p in sorted(logs.glob('digest-*.log'))],
    *[f'ci-logs/{name}.log' for name in (
        'b30-deno-macos-shard2', 'b30-deno-linux-shard2', 'b30-webkit-shard3')]]
entries = {name: (root / name).read_bytes() for name in names}
entries['before/rolling-release-digest.test.js'] = subprocess.check_output(
    ['git', 'show', 'b30ac9e4:js/tests/rolling-release-digest.test.js'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'issue_complete': False, 'published_head': 'b30ac9e4c2afb2d7824c5054e5970df66c2200d3',
    'focused_checks': {'node': 2, 'deno': 2},
    'production_change': False, 'hosted_acceptance': 'pending',
}) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-digest-deno.tar.gz', entries)
