"""Preserve exact-question period count and shared-observation regressions."""
import hashlib
import json
import runpy
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[2]
helpers = runpy.run_path(str(root / 'experiments/issue-56/evidence_bundle.py'))
_, logs, read = helpers['evidence_context'](__file__, 'period-scope')
helpers['verify_evidence'](read, {
    'parent-final': ['tests 4', 'fail 4'],
    'focused-final': ['tests 24', 'fail 0'],
    'compat': ['tests 11', 'fail 0'],
    'final-guards': ['tests 7', 'fail 0'],
    'browser-shared': ['[e2e-questions] OK (chromium)', '"scenarios":3,"rulesRestored":true'],
    'browser-final': ['[e2e-questions] OK (chromium)', '"scenarios":3,"rulesRestored":true'],
    'format-check': ['All matched files use Prettier code style!'],
})
assert 'timed out: final-period preview spelling' in read('browser-before')
receipts = {}
for phase in ['before', 'after']:
    result = json.loads((logs / f'period-scope-mcp-{phase}-final.json').read_text())
    assert not result.get('isError'), phase
    receipt = result['content'][0]['text'].split('### Result\n', 1)[1].split('\n###', 1)[0]
    receipts[phase] = json.loads(receipt)
assert receipts['before'] == dict(before=True, observations=4, text='Vietnam')
assert receipts['after'] == dict(observations=5, defaultWith=True, configuredWithout=True,
                               reload=True, compactFits=True, liveProvider=False)
parent = '0e676ed071a1042ffa6bc50c28a2ff32f873e496'
sources = helpers['changed_sources'](root, parent)
hashes = {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in sources}
entries = {name: (root / name).read_bytes() for name in sources if not name.endswith('app.min.js')}
for name in helpers['evidence_logs'](root, 'period-scope'):
    entries[name] = (root / name).read_bytes()
for name in ['question-final-period', 'question-policy']:
    path = f'js/src/automation/{name}.js'
    entries['before/' + path] = subprocess.check_output(['git', 'show', f'{parent}:{path}'], cwd=root)
for path in [logs / 'period-scope-before/ms-e2e-questions-chromium.png',
             logs / 'period-scope-native-after.png']:
    entries[str(path.relative_to(root))] = path.read_bytes()
entries['metadata.json'] = (json.dumps(dict(
    acceptance=False, parent=parent, scope='Partial QA11 exact-question period observation counts',
    distinctPortableTests=35, browserReceipts=receipts, sourceHashes=hashes,
    parentBoundary='Two exact published modules with current dependencies, not a complete prior checkout',
    providerBoundary='Synthetic temporary server, memory store and native UI; no provider account or send',
    pending='Fresh exact-source hosted verification, complete QA11 audit and all 41 unchecked criteria',
), indent=2) + '\n').encode()
helpers['write_entries_archive'](root / 'docs/case-studies/issue-56/data/question-period-scope.tar.gz',
                                entries, len(hashes))
