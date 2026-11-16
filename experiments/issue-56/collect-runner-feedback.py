"""Require finite regression, rendered, translated and drained-owner evidence."""
import hashlib
import json
from pathlib import Path
import subprocess
from evidence_bundle import evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
parent = 'a493e1cf72f7f5cb482e9aaf8676cdb235488baa'
read = lambda name: (logs / f'runner-feedback-{name}.log').read_text()
assert 'pass 9' in read('node') and 'fail 0' in read('node')
assert 'fail 5' in read('parent-node') and 'actual: undefined' in read('parent-node')
assert 'parentMissingConfirmation' in read('parent-browser')
native = [json.loads(line) for line in read('browser').splitlines()]
assert native[-1]['resourcesClosed']
assert all(native[0][key] for key in [
    'receiptOnlyFeedback', 'pendingAndAmbiguousSilent', 'recoveredStatusSilent',
    'dismissedFeedbackNotReplayed', 'escapeAndExpiry', 'focusPreserved',
    'topCenterDesktopAndPhone',
]) and native[0]['pageErrors'] == 0 and native[0]['liveProvider'] is False
mcp = json.loads((logs / 'runner-feedback-mcp-result.json').read_text())
result = json.loads(mcp['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert [item['language'] for item in result['result']] == ['en', 'ru', 'zh', 'hi']
assert all(item['translatedStartAndStop'] and item['topCenterDesktopAndPhone']
           and item['dismissedNotReplayed'] for item in result['result'])
assert result['pageErrors'] == 0 and result['liveProvider'] is False
closed = json.loads(read('mcp-final-server').splitlines()[-1])
assert closed['resourcesClosed'] and closed['healthReads'] == 0
assert closed['mutations'] == [[mode, action] for mode in ['local', 'server', 'local', 'server']
                               for action in ['start', 'stop']]
assert not read('lint').strip() and not read('diff').strip()
assert 'All matched files use Prettier code style!' in read('format-check')
names = [
    'js/src/web/runner-view-state.js', 'js/src/web/settings-runner-feedback.js',
    'js/src/web/settings-runner.js', 'js/src/web/locales/runner.js',
    'js/src/web/app.css', 'js/src/transport/runner-receipt.js',
    'js/tests/runner-view.test.js', 'js/tests/helpers/e2e-runner-feedback.mjs',
    'js/tests/e2e-vk-token-browser.mjs',
    'experiments/issue-56/runner-feedback-browser.mjs',
    'experiments/issue-56/runner-feedback-mcp.mjs',
    'experiments/issue-56/runner-api-fixture.mjs',
    'experiments/issue-56/runner-ui-mcp-server.mjs',
    'experiments/issue-56/collect-runner-feedback.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/runner-feedback.md',
    'docs/case-studies/issue-56/runner-feedback-plan.md',
    *evidence_logs(root, 'runner-feedback'),
]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in ['js/src/web/runner-view-state.js', 'js/src/web/settings-runner.js']:
    entries['before/' + name] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
images = sorted((root / 'docs/screenshots/issue-56-runner-feedback').glob('*.png'))
assert len(images) == 12
entries['metadata.json'] = (json.dumps({
    'parent': parent, 'focused_node_checks': 9, 'parent_failed_checks': 5,
    'native': native[0], 'independent_mcp': result,
    'screenshots': {str(image.relative_to(root)): hashlib.sha256(image.read_bytes()).hexdigest()
                    for image in images},
    'liveProvider': False, 'issue_complete': False, 'remaining_rows': 60,
    'acceptance_rows_completed': [], 'hosted_acceptance': 'pending',
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/runner-feedback.tar.gz', entries)
