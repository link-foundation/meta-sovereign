"""Preserve source-bound confirmation cache regressions and bounded UI evidence."""
import hashlib
import json
from pathlib import Path
import subprocess
from evidence_bundle import changed_sources, evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
parent = '217682a5eed516feb640ac860b34bcbdbe6e065e'
read = lambda name: (root / f'ci-logs/vacancy-application-{name}.log').read_text()
assert all(value in read('before') for value in ['tests 3', 'pass 0', 'fail 3'])
assert all(value in read('focused') for value in ['tests 66', 'pass 66', 'fail 0'])
parent_native = json.loads(read('before-native').splitlines()[-1])
current_native = json.loads(read('native').splitlines()[-1])
assert parent_native['applicationCache'] is False and current_native['applicationCache'] is True
for receipt in [parent_native, current_native]:
    assert receipt['entries'] == receipt['submissions'] == receipt['lostResponsePosts'] == 1
    assert receipt['reloadReplayed'] is False and receipt['errors'] == []
assert current_native['locales'] == 4
mcp = json.loads(read('mcp').split('### Result\n', 1)[1].splitlines()[0])
assert mcp['refreshPreservedConfirmation'] and mcp['desktopAndPhoneFit'] and mcp['closed']
assert mcp['locales'] == 4 and not mcp['liveProvider']
assert mcp['writes'] == ['/api/vacancies/collect']
assert mcp['errors'] == mcp['unexpectedFailures'] == []
assert len(mcp['outcomes']) == 1 and mcp['outcomes'][0]['attempts'] == mcp['outcomes'][0]['entries'] == 1
closed = json.loads(read('mcp-server').splitlines()[-1])
assert closed['resourcesClosed'] and not closed['liveProvider']
for name in ['lint', 'diff']:
    assert not read(name).strip(), name
assert 'All matched files use Prettier code style!' in read('format-check')
assert '0 over the 1500 line limit' in read('source-limits')
assert 'All documentation files are within' in read('doc-limits')
paths = [name for name in changed_sources(root) if name != 'js/src/web/app.min.js']
paths += [
    'js/src/storage/acknowledged-record.js', 'js/src/jobs/acknowledged-store.js',
    'js/src/jobs/technology-service.js', 'js/src/web/vacancy-api.js',
    'js/src/cli/vacancy-commands.js', 'js/src/server/routes-vacancies.js',
    'experiments/issue-56/application_parent_fixture.py',
    'experiments/issue-56/application-fixture.mjs',
    'experiments/issue-56/application-native-fixture.mjs',
    'js/tests/helpers/refused-snapshot.mjs', 'js/tests/helpers/vacancy-routes.mjs',
    'experiments/issue-56/evidence_bundle.py',
]
entries = {name: (root / name).read_bytes() for name in set(paths + evidence_logs(root, 'vacancy-application'))}
for name in ['vacancy-insights', 'vacancy-cache']:
    content = (root / f'ci-logs/{name}-reference.mjs').read_bytes()
    sha = hashlib.sha1(f'blob {len(content)}\0'.encode() + content).hexdigest()
    assert sha == {'vacancy-insights': '43921a6b45c3bd80b594d75635f8d43a75e470dc',
                   'vacancy-cache': '8200fc06aed2e3e65a3577e902251380f83d67b8'}[name]
    entries[f'references/{name}.mjs'] = content
for name in ['js/src/assignments/vacancy-content.js', 'js/src/assignments/vacancy-history.js',
             'js/src/assignments/vacancy.js', 'js/src/jobs/application-review.js',
             'js/src/web/vacancies-panel.js']:
    entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(
    parent=parent, focusedChecks=66, parentFailures=3, native=current_native, mcp=mcp,
    bundleSha256=hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest(),
    localFullSuite=False, liveProvider=False, cleanConsoleClaim=False,
    exactSourceHostedVerificationRequired=True, acceptedInventoryRows=[], issueComplete=False,
), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/vacancy-application-cache.tar.gz', entries)
