"""Preserve current-head CI failures and the finite timestamp/shutdown correction.

node --test --test-concurrency=1 --test-name-pattern='incoming scheduler recognizes|acquaintance CLI|contextual CLI|ordered replies share|identity scheduler|server shutdown cancels friend|server owns both maintenance|native VK seconds' js/tests/automation-trigger-state.test.js js/tests/vk-acquaintance.test.js js/tests/vk-contextual.test.js js/tests/vk-engagement.test.js js/tests/vk-gratitude.test.js js/tests/vk-identity.test.js js/tests/vk-friends.test.js js/tests/vk-maintenance.test.js
"""
from pathlib import Path
from evidence_bundle import write_hashed_archive
root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'fail 1' in (logs / 'trigger-unix-before.log').read_text()
assert 'pass 8' in (logs / 'trigger-compat-after.log').read_text()
assert 'fail 0' in (logs / 'trigger-compat-after.log').read_text()
names = [str(p.relative_to(root)) for p in logs.glob('checks-43733942504-*.log')]
names += [str(p.relative_to(root)) for p in logs.glob('trigger-*.log')]
names += ['ci-logs/checks-42c-jobs-latest.json', 'ci-logs/latest-runs.json',
          'experiments/issue-56/trigger-compat-probe.mjs',
          'experiments/issue-56/collect-trigger-compat.py',
          'js/src/automation/scheduler.js', 'js/src/automation/trigger-state.js',
          'js/tests/automation-trigger-state.test.js']
write_hashed_archive(root, root / 'docs/case-studies/issue-56/data/trigger-compat.tar.gz', names, {
    'parent': '42c406b4a20ba0b69863e5dfe73fda8a5ce54752',
    'original_failures': 7, 'focused_node_passed': 8,
    'parent_regression_failed': True, 'live_provider_effects': 0,
    'issue_complete': False, 'hosted_verification_pending': True,
}, 3)
