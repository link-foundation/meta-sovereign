"""Retain exact-parent failures and bounded application-inspection evidence."""
import hashlib
import json
from pathlib import Path
import subprocess
from evidence_bundle import changed_sources, evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
parent = '0e595743098e0bfbe2cecdd4bda2b550c3a026c9'
node = (logs / 'runner-health-ready-node.log').read_text()
assert 'pass 46' in node and 'fail 0' in node
for name in ['lint', 'diff', 'secrets']:
    assert not (logs / f'runner-health-ready-{name}.log').read_text().strip()
assert 'CLI rejects application health' in (logs / 'runner-health-before.log').read_text()
assert '404 !== 200' in (logs / 'runner-health-before-api.log').read_text()
assert '1 !== 0' in (logs / 'runner-health-before-cli.log').read_text()
assert json.loads((logs / 'runner-health-before-browser.log').read_text())['regressionFails']
native = json.loads((logs / 'runner-health-browser.log').read_text())
assert native['readyLockedDegradedUnknown'] and native['noProcessMutation'] and native['explicitHealthReads'] == 5
inspection = json.loads((logs / 'runner-health-mcp-result.json').read_text())
summary = json.loads(inspection['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert [item['language'] for item in summary['result']] == ['en', 'ru', 'zh', 'hi']
assert all(item['translated'] and item['explicitApplicationHealth'] and item['desktopAndPhoneFit'] for item in summary['result'])
assert summary['pageErrors'] == 0 and summary['reads'] == 4
closed = json.loads((logs / 'runner-health-mcp-server.log').read_text().splitlines()[-1])
assert closed['resourcesClosed'] and closed['mutations'] == [] and closed['healthReads'] == 4
names = [name for name in changed_sources(root, revision=parent)
         if not name.endswith('.png') and name != 'js/src/web/app.min.js']
names += [
    'js/src/server/runner-transport.js', 'js/src/server/runner-control.js',
    'js/src/server/runner-session.js', 'js/src/server/runner-runtime.js',
    'js/src/server/worker-client.js', 'js/src/server/request-gate.js',
    'js/src/server/routes-passcode.js', 'js/src/server/routes-derived.js',
    'experiments/issue-56/runner-api-fixture.mjs',
    'experiments/issue-56/evidence_bundle.py',
    *evidence_logs(root, 'runner-health'),
]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in ['js/src/cli/runner-command.js', 'js/src/server/routes-runner.js', 'js/src/web/settings-runner.js']:
    entries['before/' + name] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'issue_complete': False, 'remaining_rows': 60, 'acceptance_rows_completed': [],
    'parent': parent, 'focused_node_checks': 46, 'native': native,
    'independent_mcp': summary, 'hosted_acceptance': 'pending',
    'automatic_preparation_and_independent_desktop_ownership': 'unfinished',
    'console_limits': 'fixture Telegram 404s and Chromium cache-write failures retained',
    'screenshots': {str(image.relative_to(root)): hashlib.sha256(image.read_bytes()).hexdigest()
                    for image in sorted((root / 'docs/screenshots').glob('issue-56-runner-health-*.png'))},
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/runner-health.tar.gz', entries)
