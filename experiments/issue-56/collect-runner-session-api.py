"""Preserve exact-parent API refusal and focused runner admission checks."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'pass 17' in (logs / 'runner-api-ready-node.log').read_text()
assert 'fail 0' in (logs / 'runner-api-ready-node.log').read_text()
assert '17 passed | 0 failed' in (logs / 'runner-api-ready-deno.log').read_text()
assert not (logs / 'runner-api-ready-lint.log').read_text().strip()
assert not (logs / 'runner-api-ready-diff.log').read_text().strip()
assert '404 !== 200' in (logs / 'runner-api-before.log').read_text()
assert json.loads((logs / 'runner-api-after.log').read_text()) == {
    'apiStatus': True, 'launched': False, 'liveProvider': False,
}
names = [
    'js/src/cli/help.js', 'js/src/cli/runner-command.js',
    'js/src/cli/runner-client.js', 'js/src/server/index.js',
    'js/src/server/runner-controller.js', 'js/src/server/runner-control.js',
    'js/src/server/runner-runtime.js', 'js/src/server/routes-runner.js',
    'js/src/server/runtime-lifecycle.js', 'js/src/transport/runner-receipt.js',
    'js/tests/runner-cli.test.js', 'js/tests/runner-client.test.js',
    'js/tests/runner-api.test.js', 'js/tests/runner-controller.test.js',
    'experiments/issue-56/runner-api-admission.mjs',
    'experiments/issue-56/runner-api-before.py',
    'experiments/issue-56/runner-api-fixture.mjs',
    'experiments/issue-56/runner-fixture.mjs',
    'experiments/issue-56/diagnostics-fixture.mjs',
    'experiments/issue-56/collect-runner-session-api.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/DESKTOP-RUNNER.md', '.changeset/runner-session-api.md',
    'docs/case-studies/issue-56/runner-session-api.md',
    *[f'ci-logs/{name}' for name in (
        'runner-api-before.log', 'runner-api-after.log',
        'runner-api-parent-reproduction.log', 'runner-api-ready-node.log',
        'runner-api-ready-deno.log', 'runner-api-ready-lint.log',
        'runner-api-ready-format-check.log', 'runner-api-ready-diff.log',
        'runner-api-resume-runs.json',
    )],
]
entries = {name: (root / name).read_bytes() for name in names}
entries['before/js/src/server/index.js'] = subprocess.check_output([
    'git', 'show', 'adb2c8f1:js/src/server/index.js'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'issue_complete': False,
    'published_parent': 'adb2c8f1c73927fb3217afa55e84ac7805d023ee',
    'focused_checks': {'node': 17, 'deno': 17},
    'remaining_rows': 60, 'acceptance_rows_completed': [],
    'scope': 'isolated-session', 'live_provider': False,
    'hosted_acceptance': 'pending',
    'desktop_controls_and_dependency_preparation': 'unfinished',
}, indent=2) + '\n').encode()
write_entries_archive(
    root / 'docs/case-studies/issue-56/data/runner-session-api.tar.gz', entries)
