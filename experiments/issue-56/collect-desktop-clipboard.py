"""Retain finite clipboard regressions, raw browser records and exact sources."""
import json
import subprocess
from pathlib import Path
from evidence_bundle import changed_sources, evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'pass 14' in (logs / 'desktop-clipboard-node-final.log').read_text()
assert json.loads((logs / 'desktop-clipboard-before.log').read_text())['missingDesktopBridge']
assert json.loads((logs / 'desktop-clipboard-after.log').read_text())['copiedVisibleText']
assert 'Timeout 10000ms' in (logs / 'desktop-clipboard-after-timeout.log').read_text()
inspection = json.loads((logs / 'desktop-clipboard-mcp-final.json').read_text())
answer = json.loads(inspection['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert {row['language'] for row in answer['result']} == {'en', 'ru', 'zh', 'hi'}
assert all(row['exactVisibleLog'] and row['desktopReceipt'] and row['refusalVisible']
           and row['desktopAndPhoneFit'] for row in answer['result'])
assert answer['errors'] == [] and answer['nativeIPC'] is False
assert json.loads((logs / 'desktop-clipboard-mcp-server-final.log').read_text().splitlines()[-1])['resourcesClosed']
for name in ['lint-final', 'secrets', 'diff']:
    assert not (logs / f'desktop-clipboard-{name}.log').read_text().strip()
sources = [name for name in changed_sources(root)
           if name != 'experiments/issue-56/vacancy-input-order.mjs']
sources += evidence_logs(root, 'desktop-clipboard')
sources += ['experiments/issue-56/evidence_bundle.py',
            '.playwright-mcp/console-2026-11-15T21-28-22-420Z.log',
            '.playwright-mcp/console-2026-11-15T21-29-27-897Z.log']
entries = {name: (root / name).read_bytes() for name in sorted(set(sources))}
for name in sources:
    if name.startswith(('js/electron/', 'js/src/')) and subprocess.run(
            ['git', 'cat-file', '-e', f'6af537ec:{name}'], cwd=root,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'6af537ec:{name}'], cwd=root)
entries['metadata.json'] = json.dumps({
    'issue_complete': False, 'native_clipboard_ci_pending': True,
    'live_provider': False, 'local_browser': 'one owned WebKit case',
    'mcp': 'four-language mocked bridge receipts; raw console limitations retained',
}).encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/desktop-clipboard.tar.gz', entries)
