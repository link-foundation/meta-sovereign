"""Bind the optional HH search-return route to finite, private fixture evidence."""
import json
import subprocess
from evidence_bundle import evidence_context, evidence_logs, changed_sources, write_entries_archive

root, logs, read = evidence_context(__file__, 'application-route')
assert all(value in read('parent') for value in ('tests 24', 'pass 2', 'fail 22', 'cancelled 0'))
assert read('parent-exit').strip() == '1'
assert all(value in read('relevant') for value in ('pass 80', 'fail 0', 'cancelled 0'))
assert 'All matched files use Prettier code style!' in read('format-check')
assert '0 errors' in read('lint-final')
assert 'Changed sources and documents satisfy their line limits.' in read('limits')
assert not read('secrets').strip() and not read('diff').strip()
report = 'ci-logs/duplication-application-route/jscpd-report.json'
assert json.loads((root / report).read_text())['statistics']['total']['percentage'] <= 6.5
assert json.loads((root / '.jscpd.json').read_text())['threshold'] == 6.5
assert json.loads(read('before-browser').splitlines()[-1])['missingRouteOption']
native = json.loads(read('after-browser').splitlines()[-1])
assert [row['direct'] for row in native] == [True, False]
assert [row['nativeRefusals'] for row in native] == [0, 4]
assert all(row['ownerAnswersPreserved'] and row['allBrowsersClosed'] and
           row['entries'] == row['submissions'] == 0 for row in native)
response = json.loads((logs / 'application-route-mcp-result.json').read_text())
receipt = json.loads(response['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert receipt['locales'] == ['ru', 'hi', 'zh', 'en']
assert receipt['searchRoute'] and receipt['recoveredWithoutReplay'] and receipt['phoneFits']
assert receipt['closed'] and receipt['clicks'] == 0 and not receipt['liveProvider']
assert receipt['pageErrors'] == receipt['errors'] == []
assert '"resourcesClosed":true' in read('mcp-server')
names = [name for name in changed_sources(root) if 'limit-restore-probe' not in name]
names += [report, '.jscpd.json', 'experiments/issue-56/evidence_bundle.py',
          'experiments/issue-56/previous-module.mjs',
          'experiments/issue-56/published-web-bundle.mjs',
          'experiments/issue-56/application-answer-context-mcp-runner.mjs',
          'js/tests/helpers/application-panel-browser.mjs',
          'ci-logs/application-route-review.diff',
          '.playwright-mcp/console-2026-11-18T19-28-55-484Z.log',
          *evidence_logs(root, 'application-route'),
          *[str(path.relative_to(root)) for path in logs.glob('application-route-reference-*.txt')]]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
parent = subprocess.check_output(['git', 'rev-parse', 'ef34179a'], cwd=root).decode().strip()
for name in changed_sources(root):
    if name.startswith(('js/src/', 'rust/crates/')) and subprocess.run(
            ['git', 'cat-file', '-e', f'{parent}:{name}'], cwd=root,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent, criteria=['HH03'],
    acceptance=False, acceptedCriteria=88, unfinishedCriteria=30,
    parentFailures=22, parentControls=2, focusedPasses=80, liveProvider=False,
    consoleLimitations=['favicon 404', 'four app bundle ERR_CACHE_WRITE_FAILURE diagnostics'],
    hostedVerificationPending=True), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/application-search-route.tar.gz', entries)
