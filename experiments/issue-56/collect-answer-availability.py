"""Preserve the finite timing-relevance regressions and their exact source bytes."""
import base64
import hashlib
import json
import re
import runpy
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[2]
helper = runpy.run_path(str(root / 'experiments/issue-56/evidence_bundle.py'))
root, logs, read = helper['evidence_context'](__file__, 'answer-availability')
parent = '7001c9a4015155d76f0d64614c5ab45175e791b6'
for name in ['before', 'parent-regression']:
    assert 'tests 4' in read(name) and 'fail 4' in read(name), name
assert 'pass 53' in read('focused') and 'fail 1' in read('focused')
assert 'pass 54' in read('focused-final') and 'fail 0' in read('focused-final')
assert not read('lint-final').strip()
assert not read('diff').strip()
assert 'ERROR:' in read('duplication')
duplicates = read('duplication-final')
assert 'ERROR:' not in duplicates
total = next(line for line in duplicates.splitlines() if 'Total:' in line)
assert float(re.search(r'\((\d+\.\d+)%\)', total)[1]) <= 6.5
assert 'All matched files use Prettier code style!' in read('format-final')
assert '[e2e-questions] OK (chromium)' in read('browser')
receipt = json.loads(next(line.split('] ', 1)[1] for line in read('browser').splitlines()
                          if line.startswith('[question-availability]')))
assert receipt == dict(timing=True, unrelatedQuestionLiteral=True, observations=1,
                       reload=True, rawPreserved=True, mobileFits=True)
browser_receipts = {}
for filename, expected in [
    ('mcp', dict(timing=True, unrelatedExcluded=True, observations=1, compactFits=True)),
    ('mcp-shared', dict(editedWordingReloaded=True, observations=5, refusalPreservesDraft=True,
                       noFalseConfirmation=True, recoveredSavedAliases=True, compactFits=True)),
]:
    response = json.loads((logs / f'answer-availability-{filename}.json').read_text())
    assert not response.get('isError')
    actual = json.loads(re.search(r'### Result\n(\{[^\n]+\})', response['content'][0]['text'])[1])
    assert actual == expected, filename
    browser_receipts[filename] = actual
names = helper['changed_sources'](root, parent)
hashes = {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in names}
entries = {name: (root / name).read_bytes() for name in names
           if not name.endswith(('.png', 'app.min.js'))}
for name in helper['evidence_logs'](root, 'answer-availability'):
    entries[name] = (root / name).read_bytes()
for name in ['answer-availability-reference.mjs', 'answer-availability-config-reference.mjs',
             'final-period-answer-preferences.test.mjs']:
    api_name = name + '.json' if name.startswith('final-period') else name.replace('.mjs', '.json')
    reference = json.loads((logs / api_name).read_text())
    data = base64.b64decode(reference['content'])
    assert data == (logs / name).read_bytes()
    assert hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() == reference['sha']
    entries['reference/' + name] = data
    entries['reference/' + api_name] = (logs / api_name).read_bytes()
for name in ['question-turns.js', 'question-answers.js', 'question-equivalents.js']:
    path = 'js/src/automation/' + name
    entries['before/' + path] = subprocess.check_output(['git', 'show', f'{parent}:{path}'], cwd=root)
for suffix in ['133636762845.log', 'annotations.json', 'job.json']:
    name = 'ci-logs/244e6da5-package-' + suffix
    entries[name] = (root / name).read_bytes()
entries['metadata.json'] = (json.dumps(dict(
    acceptance=False, scope='Partial QA11 work-start timing relevance', parent=parent,
    distinctPortableTests=54, receipt=receipt, browserReceipts=browser_receipts,
    sourceHashes=hashes, referencePin='fa0991b8c2d0896fb3b4be6c69947f0590094b15',
    limits='Finite wording check; numeric wrong-topic answers can pass; no authenticated provider claim',
    historicalCI='244e package job exceeded its 15-minute deadline during checkout; fetch stall cause unknown',
    pending='Complete QA11 mapping and exact-source hosted verification; every other unchecked criterion',
), indent=2) + '\n').encode()
helper['write_entries_archive'](root / 'docs/case-studies/issue-56/data/question-availability.tar.gz',
                                entries, len(hashes))
