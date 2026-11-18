"""Bind observed current metadata to finite refused-refresh and recovery checks."""
import hashlib
import json
import subprocess
from evidence_bundle import changed_sources, evidence_context, evidence_logs, write_entries_archive

root, logs, read = evidence_context(__file__, 'vacancy-modern')
assert 'modern native employment retained' in read('before-native')
assert all(value in read('focused') for value in ('tests 24', 'pass 24', 'fail 0'))
assert all(value in read('ui-tests') for value in ('tests 6', 'pass 6', 'fail 0'))
native = json.loads(read('native-final'))
assert native == dict(modernMetadata=True, successfulVariants=4, refused=8,
                     cacheRecovered=True, wireFormats=2, providerOpens=13,
                     providerClicks=0, pageErrors=0, liveProvider=False)
independent = json.loads((logs / 'vacancy-modern-mcp-current.json').read_text())
receipt = json.loads(independent['content'][0]['text'].split('### Result\n')[1].splitlines()[0])
assert receipt == dict(modernMetadata=True, cacheRecovered=True, locales=4,
                       desktopAndPhoneFit=True, pageErrors=[], opens=2, closed=True,
                       clicks=0, errors=[], liveProvider=False)
assert json.loads(read('mcp-final-server').splitlines()[-1])['resourcesClosed']
for empty_check in ('lint-final', 'secrets', 'diff'):
    assert not read(empty_check).strip(), empty_check
assert 'All matched files use Prettier code style!' in read('format-check')
assert '0 over the 1500 line limit' in read('source-limits')
assert 'All documentation files are within' in read('doc-limits')
assert 'ERROR:' not in read('duplication-reuse')

included = set(changed_sources(root)) - {'js/src/web/app.min.js'}
included.update(evidence_logs(root, 'vacancy-modern'))
included.update(evidence_logs(root, 'vacancy-public'))
included.update({
    'experiments/issue-56/evidence_bundle.py',
    'experiments/issue-56/application_parent_fixture.py',
    'experiments/issue-56/application-native-mcp-server.mjs',
    'experiments/issue-56/vacancy-browser-fixture.mjs',
    'js/src/jobs/technology-service.js', 'js/src/jobs/technology-shape.js',
    'js/src/assignments/vacancy-content.js', 'js/src/assignments/vacancy-loading.js',
    'js/src/assignments/read-page.js', 'js/src/web/vacancy-api.js',
    'ci-logs/vacancy-modern-mcp-code.js', 'ci-logs/vacancy-public-mcp-code.js',
    'ci-logs/vacancy-public-native.mjs',
})
payload = {name: (root / name).read_bytes() for name in sorted(included)}
parent = '4114717bd0adf286007f02e8067b9e409f82d03c'
reader = 'js/src/assignments/vacancy-reader.js'
payload['before/' + reader] = subprocess.check_output(['git', 'show', parent + ':' + reader], cwd=root)
for reference, blob in {
    'vacancy-insights': '43921a6b45c3bd80b594d75635f8d43a75e470dc',
    'vacancy-cache': '8200fc06aed2e3e65a3577e902251380f83d67b8',
}.items():
    data = (logs / (reference + '-reference.mjs')).read_bytes()
    assert hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest() == blob
    payload['reference/' + reference + '.mjs'] = data
payload['metadata.json'] = (json.dumps({
    'parent': parent, 'focusedChecks': 30, 'native': native,
    'independentMcp': receipt,
    'bundleSha256': hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest(),
    'publicDomObservation': 'Anonymous read of https://hh.ru/vacancy/139480236; no account or submission',
    'nativePublicServiceProbe': 'Refused navigation; cause unverified',
    'fixtureSetupInterruption': 'Missing interactive stdin; owned processes stopped, then fresh MCP fixture drained',
    'exactSourceHostedVerificationRequired': True, 'acceptedInventoryRows': [], 'issueComplete': False,
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/vacancy-modern.tar.gz', payload)
