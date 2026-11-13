"""Archive bounded public detached-watcher evidence, excluding private stores."""
from pathlib import Path
from evidence_bundle import write_entries_archive
import hashlib
import json

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'pass 62' in (logs / 'forms-watchers-tests.log').read_text()
assert '45 passed | 0 failed' in (logs / 'forms-watchers-deno.log').read_text()
assert not (logs / 'forms-watchers-lint.log').read_text().strip()
assert not (logs / 'forms-watchers-lint-final.log').read_text().strip()
raw = (logs / 'forms-watchers-cli-browser.log').read_text()
receipt, _ = json.JSONDecoder().raw_decode(raw)
assert receipt['ok'] and receipt['initiatingCliExited']
assert receipt['beforeSubmit']['answerLearning']['tracked'] == 2
assert receipt['stableBeforeSend']['answerLearning']['saved'] == 1
assert receipt['stableBeforeSend']['answerLearning']['last']['kind'] == 'stable-owner-edit'
assert receipt['reusedWatcher']['watcher']['pid'] == receipt['beforeSubmit']['watcher']['pid']
assert receipt['history']['answerLearning']['saved'] == 2
assert receipt['history']['answerLearning']['failed'] == 0
assert receipt['stopped']['state'] == 'stopped' and receipt['submits'] == 1
assert receipt['savedHistory']['source'] == 'saved-checkpoints'
assert len(receipt['rules']) == 2
assert all(not answer['approved'] and answer['count'] == 1
           for rule in receipt['rules'] for answer in rule['answers'])
assert '"token":' not in json.dumps(receipt)

names = [
    'ci-logs/forms-watchers-tests.log', 'ci-logs/forms-watchers-deno.log',
    'ci-logs/forms-watchers-lint.log', 'ci-logs/forms-watchers-lint-final.log',
    'ci-logs/forms-watchers-cli-browser.log',
    'ci-logs/forms-watchers-initiating-cli.log',
    'ci-logs/forms-watchers-reattached-cli.log',
    'ci-logs/forms-watchers-ci-lifecycle-before.log',
    'ci-logs/forms-watchers-channel-final.log',
    'ci-logs/forms-watchers-parent-node-ubuntu.log',
    'ci-logs/forms-watchers-parent-checks-status.json',
    'ci-logs/forms-watchers-current-ci-runs.json',
    'ci-logs/forms-watchers-checks-42885507475.log',
    'examples/forms-detached-review.mjs',
    'experiments/issue-56/forms-watcher-cli.mjs',
    'experiments/issue-56/collect-forms-watchers.py',
    'js/src/cv/browser.js', 'js/src/cv/persistent-browser.js',
    'js/src/forms/reader.js', 'js/src/forms/review-sessions.js',
    'js/src/forms/review-lifecycle.js', 'js/src/forms/review-learning.js',
    'js/src/forms/review-monitor.js', 'js/src/forms/review-activity.js',
    'js/src/forms/local-channel.js', 'js/src/forms/watch-store.js',
    'js/src/forms/knowledge-bridge.js', 'js/src/forms/watcher-client.js',
    'js/src/forms/watcher-core.js', 'js/src/forms/watcher-files.js',
    'js/src/forms/watcher-journal.js', 'js/src/forms/watcher-management.js',
    'js/src/forms/watcher-rpc.js', 'js/src/forms/watcher-worker.js',
    'js/src/cli/forms-commands.js', 'js/src/cli/forms-review-commands.js',
    'js/src/cli/forms-watcher-commands.js',
    'js/tests/forms-watchers.test.js', 'js/tests/forms-watch-store.test.js',
    'js/tests/forms-local-channel.test.js', 'js/tests/forms-learning.test.js',
    'js/tests/forms-review-sessions.test.js',
    'js/tests/e2e-forms-watcher-browser.mjs',
    'js/tests/e2e-forms-reader-browser.mjs', 'js/tests/ci-contracts.test.js',
]
names += [str(p.relative_to(root)) for p in logs.glob('forms-watchers-parent-job-*.log')
          if '.download.' not in p.name]
entries = {name: (root / name).read_bytes() for name in sorted(names)}
entries['metadata.json'] = (json.dumps({
    'date': '2026-11-10', 'node_checks': 62, 'deno_checks': 45,
    'stability_ms': 60000, 'browser': 'actual Node CLI and persistent Chromium',
    'preceding_head': 'cea1af881de48120c78528be6faeeb713e63a788',
    'remaining': 'unchecked issue-wide requirements remain unfinished',
    'screenshots': {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in sorted((root / 'docs/screenshots').glob('issue-56-forms-watcher-*.png'))},
}, indent=2) + '\n').encode()
archive = root / 'docs/case-studies/issue-56/data/forms-detached-watchers.tar.gz'
write_entries_archive(archive, entries)
