"""Preserve two actual allocation refusals and the finite selection regression."""
import json
from pathlib import Path
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
names = [
    'hosted-cb95-cancelled-deno-job.json',
    'hosted-cb95-cancelled-deno-annotations.json',
    'hosted-cb95-cancelled-deno-attempt2-job.json',
    'hosted-cb95-cancelled-deno-attempt2-annotations.json',
    'hosted-cb95-checks-attempt1.json',
    'hosted-cb95-attempt2-status.json',
    'hosted-cb95-pipeline-attempt1.log',
    'hosted-cb95-pipeline-attempt2.log',
    'hosted-cb95-cancelled-job-logs.log',
    'ci-macos-capacity-parent-release.yml',
    'ci-macos-capacity-parent.log',
    'ci-macos-capacity-node.log',
    'ci-macos-capacity-format.log',
]
for stem in ['hosted-cb95-cancelled-deno-', 'hosted-cb95-cancelled-deno-attempt2-']:
    job = json.loads((logs / f'{stem}job.json').read_text())
    assert job['conclusion'] == 'cancelled' and job['steps'] == []
    assert not job['runner_name'] and job['head_sha'].startswith('cb95c654')
    annotations = json.loads((logs / f'{stem}annotations.json').read_text())
    assert any('not acquired by Runner' in item['message'] for item in annotations)
    assert any('capacity constraints' in item['message'] for item in annotations)
before = (logs / 'ci-macos-capacity-parent.log').read_text()
after = (logs / 'ci-macos-capacity-node.log').read_text()
assert 'ℹ fail 1' in before and 'the capacity-refused shard uses Intel' in before
assert 'ℹ pass 1' in after and 'ℹ fail 0' in after
entries = {f'ci-logs/{name}': (logs / name).read_bytes() for name in names}
for name in [
    '.github/workflows/release.yml',
    'js/tests/ci-deno-shards.test.js',
    'docs/case-studies/issue-56/ci-macos-capacity.md',
    'experiments/issue-56/collect-ci-macos-capacity.py',
    'experiments/issue-56/evidence_bundle.py',
]:
    entries[name] = (root / name).read_bytes()
entries['metadata.json'] = (json.dumps({
    'sha': 'cb95c654941061b70559ca2eb80c822a4244fd20',
    'run': 43894465845, 'attempts': 2, 'testStepsStarted': 0,
    'localFocusedChecks': 1, 'nativeRuntimeChecks': 'pending published correction',
    'acceptance': False,
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-macos-capacity.tar.gz', entries)
print(f'Verified {len(entries)} allocation and correction evidence entries')
