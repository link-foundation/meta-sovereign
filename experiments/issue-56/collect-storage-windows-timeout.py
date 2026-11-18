"""Retain an unresolved hosted failure and finite native diagnostic evidence."""
import collections
import hashlib
import json
from evidence_bundle import bundle, evidence_context

root, logs, read = evidence_context(__file__, 'storage-windows-timeout')
for tag in ['focused', 'native-trace-local']:
    assert 'pass 5' in read(tag) and 'fail 0' in read(tag), tag
failed = logs / 'node-windows-133996283032.log'
assert failed.read_text().count('test timed out after 10000ms') == 5
line_failure = logs / '40b4-line-limits.log'
assert 'File has 1514 lines (limit 1500)' in line_failure.read_text()
assert '0 over the 1500 line limit' in (logs / 'ci-node-action-lines.log').read_text()
assert 'pass 22' in (logs / 'ci-node-action-focused.log').read_text()
assert '2 !== 1' in (logs / '027b-workflow-contracts.log').read_text()
assert 'fail 1' in (logs / 'ci-node-action-policy-before.log').read_text()
assert 'pass 3' in (logs / 'ci-node-action-policy-final.log').read_text()
summary = []
for path in sorted((logs / 'storage-timeout').glob('*.json')):
    events = json.loads(path.read_text())['traceEvents']
    names = collections.Counter(event['name'] for event in events
                                if 'fs' in event.get('cat', ''))
    assert names and events
    summary.append(dict(name=path.name, bytes=path.stat().st_size,
                        sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                        events=len(events), operations=dict(names)))
assert len(summary) == 5 and any('fsync' in item['operations'] for item in summary)
summary_path = logs / 'storage-windows-timeout-trace-summary.json'
summary_path.write_text(json.dumps(summary, indent=2) + '\n')
bundle(root, [
    '.github/workflows/release.yml',
    '.github/actions/node-tests/action.yml',
    'js/tests/ci-node-shards.test.js',
    'js/tests/ci-cache-policy.test.js',
    'js/scripts/check-file-line-limits.sh',
    'experiments/issue-56/storage-windows-timeout.mjs',
    'experiments/issue-56/collect-storage-windows-timeout.py',
    'docs/case-studies/issue-56/ci-storage-windows-timeout.md',
    'ci-logs/current-45bb2376-jobs.json', str(failed.relative_to(root)),
    str(summary_path.relative_to(root)),
    'ci-logs/storage-windows-timeout-focused.log',
    'ci-logs/storage-windows-timeout-native-trace-local.log',
    str(line_failure.relative_to(root)),
    'ci-logs/ci-node-action-lines.log',
    'ci-logs/ci-node-action-focused.log',
    'ci-logs/027b-workflow-contracts.log',
    'ci-logs/ci-node-action-policy-before.log',
    'ci-logs/ci-node-action-policy-final.log',
], 'docs/case-studies/issue-56/data/ci-storage-windows-timeout.tar.gz', {
    'acceptance': False, 'cause': 'unconfirmed',
    'failedSource': '45bb2376', 'run': 44069711910, 'job': 133996283032,
    'focusedTestsPerRun': 5, 'pending': 'Hosted cause and all 40 original criteria',
}, 'unused-storage-timeout-pattern')
