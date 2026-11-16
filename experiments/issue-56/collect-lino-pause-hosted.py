"""Preserve completed Windows timings without inferring the earlier cause."""
import json
from pathlib import Path
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
job = json.loads((logs / 'hosted-b61-windows-node-1-job.json').read_text())
assert job['id'] == 133345481256 and job['run_id'] == 43879915890
assert job['head_sha'] == 'b61cf5fd504e8e928eec5e4ed869087f869dd395'
assert job['status'] == 'completed' and job['conclusion'] == 'success'
lines = (logs / 'hosted-b61-windows-node-1.log').read_text().splitlines()
events = [json.loads(line.split('[application-limit-store] ', 1)[1])
          for line in lines if '[application-limit-store] ' in line]
assert len(events) == 56
for index in range(1, 29):
    assert [event['event'] for event in events if event['id'] == index] == ['started', 'completed']
assert all(set(event) == {'id', 'phase', 'event', 'elapsedMs'} for event in events)
assert '✔ an acknowledged pause survives' in lines[2045]
assert '(88.994ms)' in lines[2045]
assert any('ℹ fail 0' in line for line in lines)
assert any('ℹ cancelled 0' in line for line in lines)
names = [
    'ci-logs/hosted-b61-windows-node-1-job.json',
    'ci-logs/hosted-b61-windows-node-1.log',
    'docs/case-studies/issue-56/ci-lino-pause.md',
    'docs/case-studies/issue-56/ci-lino-pause-plan.md',
    'experiments/issue-56/collect-lino-pause-hosted.py',
    'experiments/issue-56/evidence_bundle.py',
]
entries = {name: (root / name).read_bytes() for name in names}
entries['metadata.json'] = (json.dumps({
    'sha': job['head_sha'], 'job': job['html_url'], 'events': events,
    'testDurationMs': 88.994, 'earlierCauseEstablished': False,
    'deadlineUnchangedMs': 5000, 'issueComplete': False,
}, indent=2) + '\n').encode()
write_entries_archive(
    root / 'docs/case-studies/issue-56/data/ci-lino-pause-hosted.tar.gz', entries)
