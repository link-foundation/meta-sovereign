"""Retain bounded shared configuration checks and observed draft/conflict UI."""
import hashlib
import json
from pathlib import Path
import subprocess
from evidence_bundle import changed_sources, evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
parent = '060b17210d84275ebd7e8bfb65d60aefe7c1a77e'
assert 'pass 51' in (logs / 'runner-profile-ready-node.log').read_text()
assert 'fail 0' in (logs / 'runner-profile-ready-node.log').read_text()
assert '10 passed | 0 failed' in (logs / 'runner-profile-ready-deno.log').read_text()
for name in ['lint', 'diff']:
    assert not (logs / f'runner-profile-ready-{name}.log').read_text().strip()
assert json.loads((logs / 'runner-profile-before.log').read_text())['regressionFails']
native = json.loads((logs / 'runner-profile-browser.log').read_text())
assert native['revisionConflictRetainsDraft'] and native['noProcessMutation']
inspection = json.loads((logs / 'runner-profile-mcp-result.json').read_text())
result = json.loads(inspection['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert [item['language'] for item in result['result']] == ['en', 'ru', 'zh', 'hi']
assert all(item['translated'] and item['profileAcknowledged'] and item['desktopAndPhoneFit'] for item in result['result'])
assert result['pageErrors'] == 0 and result['saves'] == 4
closed = json.loads((logs / 'runner-profile-mcp-server.log').read_text().splitlines()[-1])
assert closed['resourcesClosed'] and closed['mutations'] == []
names = [name for name in changed_sources(root, revision=parent) if not name.endswith('.png') and name != 'js/src/web/app.min.js']
names += [
    'js/src/cli/runner-profile.js', 'js/src/cli/readable-configuration.js',
    'js/src/server/runner-runtime.js', 'js/src/storage/store-lock.js',
    'js/src/storage/durable.js', 'experiments/issue-56/runner-fixture.mjs',
    'experiments/issue-56/runner-ui-mcp-server.mjs',
    'experiments/issue-56/evidence_bundle.py',
    *evidence_logs(root, 'runner-profile'),
]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
name = 'js/src/web/settings-runner.js'
entries['before/' + name] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'issue_complete': False, 'remaining_rows': 60, 'acceptance_rows_completed': [],
    'parent': parent, 'focused_checks': {'node': 51, 'deno': 10},
    'native': native, 'independent_mcp': result, 'hosted_acceptance': 'pending',
    'automatic_preparation_readiness_independent_desktop_ownership': 'unfinished',
    'console_limits': 'fixture Telegram/favicon 404s and Chromium cache-write failures retained',
    'screenshots': {str(image.relative_to(root)): hashlib.sha256(image.read_bytes()).hexdigest() for image in sorted((root / 'docs/screenshots').glob('issue-56-runner-profile-*.png'))},
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/runner-profile-editing.tar.gz', entries)
