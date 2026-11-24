"""Preserve finite full-corpus regressions and actual-parent browser recovery."""
import hashlib
import json
from pathlib import Path
import subprocess
from evidence_bundle import changed_sources, evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
parent = '51ff8bf0ac1cd703e722ad35602e6c0fc1924137'
read = lambda name: (root / f'ci-logs/vacancy-corpus-{name}.log').read_text()
assert all(x in read('before') for x in ['tests 8', 'pass 1', 'fail 7'])
assert all(x in read('focused') for x in ['tests 37', 'pass 37', 'fail 0'])
receipts = []
for phase, count in [('before', 100), ('after', 101)]:
    receipt = json.loads(read(f'mcp-{phase}').split('### Result\n', 1)[1].splitlines()[0])
    assert receipt['visible'] == count and receipt['seeded'] == 101
    assert receipt['locales'] == 4 and receipt['desktopAndPhoneFit']
    assert receipt['errors'] == receipt['writes'] == []
    assert receipt['opens'] == receipt['clicks'] == 0 and receipt['closed']
    assert not receipt['recoveryReplayed'] and not receipt['liveProvider']
    receipts.append(receipt)
for name in ['before-native', 'mcp-server']:
    assert json.loads(read(name).splitlines()[-1])['resourcesClosed']
for name in ['lint-final', 'diff']:
    assert not read(name).strip(), name
assert 'All matched files use Prettier code style!' in read('format-check')
assert '0 over the 1500 line limit' in read('source-limits')
assert 'All documentation files are within' in read('doc-limits')
paths = [name for name in changed_sources(root) if name != 'js/src/web/app.min.js']
paths += [
    'experiments/issue-56/application_parent_fixture.py',
    'experiments/issue-56/application-native-mcp-server.mjs',
    'experiments/issue-56/vacancy-browser-fixture.mjs',
    'experiments/issue-56/vacancy-fixture.mjs',
    'experiments/issue-56/technology-fixture.mjs',
    'experiments/issue-56/evidence_bundle.py',
    'js/tests/helpers/vacancy-routes.mjs', 'js/src/web/technology-api.js',
    'js/src/cli/vacancy-commands.js', 'js/src/jobs/vacancy-selection-service.js',
    'js/src/jobs/technology-shape.js',
]
entries = {name: (root / name).read_bytes() for name in sorted(set(paths + evidence_logs(root, 'vacancy-corpus')))}
source = (root / 'ci-logs/vacancy-cache-reference.mjs').read_bytes()
assert hashlib.sha1(f'blob {len(source)}\0'.encode() + source).hexdigest() == '8200fc06aed2e3e65a3577e902251380f83d67b8'
entries['reference/vacancy-cache.mjs'] = source
for name in ['js/src/jobs/technology-service.js', 'js/src/jobs/technology-analysis.js',
             'js/src/jobs/technology-result.js', 'js/src/web/vacancy-api.js']:
    entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(
    parent=parent, focusedChecks=37, parentFailures=7, parentControls=1,
    browserReceipts=receipts, localFullSuite=False, liveProvider=False,
    bundleSha256=hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest(),
    exactSourceHostedVerificationRequired=True, acceptedInventoryRows=[], issueComplete=False,
), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/vacancy-corpus.tar.gz', entries)
