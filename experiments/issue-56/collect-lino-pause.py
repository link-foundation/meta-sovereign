"""Preserve the exact Windows timeout without treating local timing as its cause."""
import json
from pathlib import Path
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
job = json.loads((logs / 'hosted-a493-windows-node-1-job.json').read_text())
assert job['id'] == 133327682519 and job['run_id'] == 43874840625
assert job['head_sha'] == 'a493e1cf72f7f5cb482e9aaf8676cdb235488baa'
assert job['conclusion'] == 'failure'
failed = (logs / 'hosted-a493-windows-node-1-failure.log').read_text().splitlines()
assert 'an acknowledged pause survives' in failed[1986]
assert 'test timed out after 5000ms' in failed[3893]
read = lambda name: (logs / f'lino-pause-{name}.log').read_text()
assert 'pass 1' in read('default') and 'fail 0' in read('default')
assert '[application-limit-store]' not in read('default')
traced = read('traced')
assert 'pass 1' in traced and 'fail 0' in traced
events = [json.loads(line.split('] ', 1)[1]) for line in traced.splitlines()
          if line.startswith('[application-limit-store]')]
assert len(events) == 56
assert all(set(event) == {'id', 'phase', 'event', 'elapsedMs'} for event in events)
assert {event['phase'] for event in events} == {
    'open-first', 'enter', 'acknowledge-limit', 'stop-first-service', 'reopen',
    'read-reopened-pause', 'store-put', 'store-flush', 'store-close',
}
for index in range(1, 29):
    assert [event['event'] for event in events if event['id'] == index] == ['started', 'completed']
assert not read('lint').strip() and not read('diff').strip()
assert 'All matched files use Prettier code style!' in read('format-check')
names = [
    '.github/workflows/release.yml', 'js/tests/job-application-limit.test.js',
    'experiments/issue-56/application-limit-trace.mjs',
    'experiments/issue-56/collect-lino-pause.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/ci-lino-pause.md',
    'docs/case-studies/issue-56/ci-lino-pause-plan.md',
    'ci-logs/hosted-a493-windows-node-1-failure.log',
    'ci-logs/hosted-a493-windows-node-1-job.json',
    'ci-logs/hosted-a493-lino-pause-local.log',
    *[f'ci-logs/lino-pause-{name}.log' for name in
      ['default', 'traced', 'lint', 'diff', 'format-check']],
]
entries = {name: (root / name).read_bytes() for name in names}
entries['metadata.json'] = (json.dumps({
    'failed_job': job['id'], 'head_sha': job['head_sha'],
    'cause_established': False, 'deadline_unchanged_ms': 5000,
    'focused_trace_events': len(events), 'liveProvider': False,
    'issue_complete': False, 'remaining_rows': 60,
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-lino-pause.tar.gz', entries)
