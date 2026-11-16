"""Retain finite CLI/session regressions without claiming desktop acceptance."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert '34' in (logs / 'runner-ready-node.log').read_text()
assert 'fail 0' in (logs / 'runner-ready-node.log').read_text()
assert '25 passed | 0 failed' in (logs / 'runner-ready-deno.log').read_text()
assert not (logs / 'runner-ready-lint.log').read_text().strip()
assert not (logs / 'runner-ready-diff.log').read_text().strip()
assert 'runner status was not admitted' in (logs / 'runner-cli-before.log').read_text()
assert '2 !== 1' in (logs / 'runner-lease-before.log').read_text()
assert json.loads((logs / 'runner-cli-after.log').read_text()) == {
    'runnerStatus': True, 'launched': False, 'openedApplicationStore': False,
}
sources = [
    'js/src/cli/readable-configuration.js', 'js/src/cli/runner-command.js',
    'js/src/cli/runner-profile.js', 'js/src/cli/command-runner.js',
    'js/src/cli/help.js', 'js/src/cli/index.js',
    'js/src/cli/startup-configuration.js', 'js/src/storage/store-lock.js',
    *[str(p.relative_to(root)) for p in sorted((root / 'js/src/server').glob('runner-*.js'))],
    *[str(p.relative_to(root)) for p in sorted((root / 'js/tests').glob('runner-*.test.js'))],
    'js/tests/store-exclusive-race.test.js', 'js/tests/store-handoff.test.js',
    'js/tests/startup-configuration.test.js',
    *[str(p.relative_to(root)) for p in sorted((root / 'experiments/issue-56').glob('runner-*'))],
    'experiments/issue-56/collect-runner-session-control.py',
    'experiments/issue-56/evidence_bundle.py', 'docs/DESKTOP-RUNNER.md',
    'docs/case-studies/issue-56/runner-session-control.md',
    'docs/case-studies/issue-56/vk-desktop-execution-plan.md',
    '.changeset/visible-browser-defaults.md',
]
names = sources + [f'ci-logs/{name}' for name in (
    'runner-cli-before.log', 'runner-cli-after.log', 'runner-lease-before.log',
    'runner-ready-node.log', 'runner-ready-deno.log', 'runner-ready-lint.log',
    'runner-ready-format.log', 'runner-ready-format-check.log',
    'runner-ready-diff.log', 'runner-current-runs.json',
    'desktop-runner-start-readme.source', 'desktop-runner-start-package.source',
    'desktop-runner-start-session-probe.source',
    'desktop-runner-start-status-probe.source',
    'vk-desktop-reference-requirements.source',
)]
entries = {name: (root / name).read_bytes() for name in dict.fromkeys(names)}
for name in ['js/src/cli/index.js', 'js/src/storage/store-lock.js']:
    entries['before/' + name] = subprocess.check_output(
        ['git', 'show', 'd6d3070d:' + name], cwd=root)
entries['metadata.json'] = (json.dumps({
    'issue_complete': False,
    'published_parent': 'd6d3070d353fd1b9ecde41a1d045ae4112675c83',
    'focused_checks': {'node': 34, 'deno': 25},
    'acceptance_rows_completed': [], 'remaining_rows': 60,
    'scope': 'isolated-session',
    'hosted_acceptance': 'pending',
    'actual_installed_backend_and_ssh': 'unverified',
    'desktop_controls_and_dependency_preparation': 'unfinished',
    'reference_commits': {
        'konard/vk-bot-desktop': '8fbf3b7c42fd8e995ef137cab9b9653a7dc9b1a1',
        'link-foundation/start': '3872bd031f5b51902e20bd22b84e9d51a59fcc0b',
    },
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/runner-session-control.tar.gz', entries)
