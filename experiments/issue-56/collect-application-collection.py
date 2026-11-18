"""Bind the independent collection preference to finite actual-source checks."""
import hashlib
import json
import subprocess
from evidence_bundle import changed_sources, evidence_context, evidence_logs, write_entries_archive

root, logs, read = evidence_context(__file__, 'application-collection')
assert all(value in read('before-node') for value in ('tests 9', 'pass 2', 'fail 7'))
assert 'Persistent collection opt-out is missing' in read('before-native')
assert all(value in read('focused') for value in ('tests 15', 'pass 15', 'fail 0'))
assert all(value in read('compatibility') for value in ('tests 19', 'pass 19', 'fail 0'))
native = json.loads(read('native'))
assert native == dict(collection=False, durableVacancy=False, existingCacheUnchanged=True,
                     fullContextInRun=True, locales=4, nativeEntries=1, submissions=0,
                     ownerAnswerPreserved=True, offlineContext=None, opens=3,
                     allBrowsersClosed=True, errors=[], liveProvider=False)
result = json.loads((logs / 'application-collection-mcp-current.json').read_text())
receipt = json.loads(result['content'][0]['text'].split('### Result\n')[1].splitlines()[0])
assert receipt == dict(collection=False, locales=4, completeContext=True, offlineContext=None,
                       desktopAndPhoneFit=True, pageErrors=[], opens=3, closed=True,
                       clicks=0, cacheEntries=1, journalVacancy=False, errors=[],
                       cacheFingerprint='97f90ac139086b5d8b28e760e6dcf5d2b9cd2b45c825400fa76488f0a2b8d3f5',
                       liveProvider=False)
for name in ('mcp-server', 'mcp-first-server', 'mcp-instrumentation-server'):
    assert json.loads(read(name).splitlines()[-1])['resourcesClosed']
for name in ('lint-final', 'secrets', 'diff'):
    assert not read(name).strip(), name
assert 'All matched files use Prettier code style!' in read('format-check')
assert '0 over the 1500 line limit' in read('source-limits')
assert 'All documentation files are within' in read('doc-limits')
assert 'ERROR:' not in read('duplication')

names = set(changed_sources(root)) - {'js/src/web/app.min.js'}
names.update(evidence_logs(root, 'application-collection'))
names.update({
    'experiments/issue-56/evidence_bundle.py',
    'experiments/issue-56/application-native-fixture.mjs',
    'experiments/issue-56/application-native-mcp-server.mjs',
    'experiments/issue-56/application-answer-context-mcp-runner.mjs',
    'experiments/issue-56/vacancy-browser-fixture.mjs',
    'experiments/issue-56/question-browser-probe.mjs',
    'experiments/issue-56/published-web-bundle.mjs',
    'experiments/issue-56/previous-module.mjs',
    'js/tests/helpers/application-panel-browser.mjs',
    'js/tests/helpers/application-controls.mjs',
    'ci-logs/application-collection-mcp-code.js',
})
payload = {name: (root / name).read_bytes() for name in sorted(names)}
parent = '6c90c3f50f97102ee214cb7e4acb707f5eae99b2'
for name in sorted(names):
    if name.startswith('js/src/') and subprocess.run(
            ['git', 'cat-file', '-e', parent + ':' + name], cwd=root,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        payload['before/' + name] = subprocess.check_output(
            ['git', 'show', parent + ':' + name], cwd=root)
for name in ('application-panel.js', 'application-state.js'):
    path = 'js/src/web/' + name
    assert payload['before/' + path] == subprocess.check_output(
        ['git', 'show', 'd48a6179:' + path], cwd=root)
for name, filename, blob in (
    ('vacancy-insights.mjs', 'vacancy-insights-reference.mjs', '43921a6b45c3bd80b594d75635f8d43a75e470dc'),
    ('vacancy-cache.mjs', 'vacancy-cache-reference.mjs', '8200fc06aed2e3e65a3577e902251380f83d67b8'),
    ('README.md', 'hh-reference-readme.md', '6a258493021fc6691324b939b6282e6e9b710e60'),
):
    data = (logs / filename).read_bytes()
    assert hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest() == blob, filename
    payload['reference/' + name] = data
payload['metadata.json'] = (json.dumps({
    'parent': parent, 'nativePanelParent': 'd48a6179',
    'pinnedReferenceCommit': 'fa0991b8c2d0896fb3b4be6c69947f0590094b15',
    'parentRegressionFailures': 7, 'parentControlsPassing': 2,
    'focusedPassing': 15, 'compatibilityPassing': 19,
    'native': native, 'independentMcp': receipt,
    'bundleSha256': hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest(),
    'retainedHarnessFailures': ['original fixture store differs from runtime store',
        'incorrect released reload/close expectations', 'browser cross-origin stats fetch',
        'put instrumentation bypassed by acknowledged causal writes'],
    'consoleClean': False, 'localStressTesting': False,
    'exactSourceHostedVerificationRequired': True, 'acceptedInventoryRows': [],
    'issueComplete': False,
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/application-collection.tar.gz', payload)
