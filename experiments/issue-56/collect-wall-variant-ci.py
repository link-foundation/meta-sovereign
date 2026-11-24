"""Archive only the atomic CI assertion correction, excluding other draft work."""
import json
from pathlib import Path
from evidence_bundle import write_hashed_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
for runtime, passing in [('node', 'pass 7'), ('bun', '7 pass'), ('deno', '7 passed | 0 failed')]:
    assert passing in (logs / f'wall-variants-{runtime}.log').read_text()
assert 'fail 1' in (logs / 'wall-variants-before-node.log').read_text()
jobs = json.loads((logs / 'friend-stats-current-jobs.json').read_text())
assert jobs['headSha'] == '7205a3c0c7e853a9028274721d6fb285a8ceaefb'
failures = [job for job in jobs['jobs'] if job['conclusion'] == 'failure']
assert len(failures) == 8
names = [
    'js/tests/vk-wall-interfaces.test.js',
    'experiments/issue-56/wall-variants-before.py',
    'experiments/issue-56/collect-wall-variant-ci.py',
    'docs/case-studies/issue-56/wall-variant-ci.md',
    'ci-logs/friend-stats-current-jobs.json',
    'ci-logs/friend-stats-current-runs.json',
]
for job in failures:
    name = f"ci-logs/getter-head-{job['databaseId']}.log"
    text = (root / name).read_text()
    assert 'both Lino encodings require same-origin explicit reviewed wall confirmation' in text
    assert 'AssertionError' in text and 'Add me as a friend to share ideas and interests.' in text
    assert '(fail) log formatting avoids getters, toJSON and cycles' not in text
    names.append(name)
names += [str(path.relative_to(root)) for path in logs.glob('wall-variants-*.log')]
write_hashed_archive(root, root / 'docs/case-studies/issue-56/data/wall-variant-ci.tar.gz', names, {
    'parent': jobs['headSha'], 'hosted_run': 43749062273,
    'failed_runtime_jobs': 8, 'focused_passes_per_runtime': 7,
    'production_changed': False, 'live_provider_effects': 0,
    'unchecked_required_rows': 60, 'issue_complete': False,
}, 3)
