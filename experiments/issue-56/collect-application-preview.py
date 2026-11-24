"""Preserve separately configured native vacancy preview and refusal evidence."""
import json
import subprocess
from evidence_bundle import evidence_context, evidence_logs, changed_sources, write_entries_archive

root, logs, read = evidence_context(__file__, 'application-preview')
parent_log = read('parent-final')
assert all(value in parent_log for value in ('tests 29', 'pass 4', 'fail 25', 'cancelled 0'))
assert parent_log.count('AssertionError [ERR_ASSERTION]') == 25
assert read('parent-exit').strip() == '1'
assert all(value in read('focused-final') for value in ('pass 107', 'fail 0', 'cancelled 0'))
assert all(value in read('refactor-tests') for value in ('pass 22', 'fail 0', 'cancelled 0'))
assert 'All matched files use Prettier code style!' in read('format-check')
assert 'Changed sources and documents satisfy their line limits.' in read('limits')
for name in ('lint-final', 'secrets', 'diff'):
    assert not read(name).strip(), name
report = 'ci-logs/duplication-application-preview/jscpd-report.json'
duplication = json.loads((root / report).read_text())['statistics']['total']
assert duplication['percentage'] <= 6.5
assert json.loads((root / '.jscpd.json').read_text())['threshold'] == 6.5
native = json.loads(read('browser-final').splitlines()[-1])
assert native['nativeRefusals'] == 5
assert native['entries'] == 1 and native['submissions'] == 0
assert native['allBrowsersClosed'] and not native['liveProvider']
response = json.loads((logs / 'application-preview-mcp-result.json').read_text())
receipt = json.loads(response['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert [row['locale'] for row in receipt['locales']] == ['ru', 'hi', 'zh', 'en']
assert receipt['previewSeconds'] == 0.2 and receipt['recoveredWithoutReplay']
assert receipt['entries'] == 1 and receipt['submissions'] == 0
assert receipt['closed'] and receipt['phoneFits'] and receipt['pageErrors'] == []
assert receipt['errors'] == [] and not receipt['liveProvider']
assert '{"resourcesClosed":true,"liveProvider":false}' in read('mcp-server')
names = changed_sources(root) + [report, '.jscpd.json',
    'experiments/issue-56/evidence_bundle.py',
    'experiments/issue-56/previous-module.mjs',
    'js/tests/helpers/application-panel-browser.mjs',
    '.playwright-mcp/console-2026-11-18T18-43-17-103Z.log',
    '.playwright-mcp/console-2026-11-18T18-50-11-708Z.log',
    *evidence_logs(root, 'application-preview'),
    *[str(path.relative_to(root)) for path in (logs / 'application-preview-mcp-initial').iterdir()]]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
parent = subprocess.check_output(['git', 'rev-parse', 'd21b7f97'], cwd=root).decode().strip()
for name in changed_sources(root):
    if name.startswith(('js/src/', 'rust/crates/')) and subprocess.run(
            ['git', 'cat-file', '-e', f'{parent}:{name}'], cwd=root,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        entries[f'before/{name}'] = subprocess.check_output(
            ['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent,
    criteria=['HH03', 'R-Z17'], acceptance=False, acceptedCriteria=88,
    unfinishedCriteria=30, parentFailures=25, parentControls=4,
    focusedPasses=107, liveProvider=False, hostedVerificationPending=True),
    indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/application-preview.tar.gz', entries)
