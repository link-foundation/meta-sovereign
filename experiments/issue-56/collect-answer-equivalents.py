"""Bind finite explicit-wording regression evidence to its actual source bytes."""
import base64
import hashlib
import json
from pathlib import Path
import re
import runpy
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
parent = '244e6da5dfb68303efd9ed6decad9ee73996954d'
revision = sys.argv[1] if len(sys.argv) > 1 else None
for filename, count in [('focused', 68), ('final-focused', 17)]:
    log = (logs / f'answer-equivalents-{filename}.log').read_text()
    assert f'pass {count}' in log and 'fail 0' in log, filename
failure = (logs / 'answer-equivalents-parent-regression.log').read_text()
assert 'tests 4' in failure and 'fail 4' in failure
assert '0 !== 5' in failure and 'Missing expected exception' in failure
assert not (logs / 'answer-equivalents-lint.log').read_text().strip()
duplicates = (logs / 'answer-equivalents-duplication.log').read_text()
assert 'ERROR:' not in duplicates
total = next(line for line in duplicates.splitlines() if 'Total:' in line)
assert float(re.search(r'\((\d+\.\d+)%\)', total)[1]) <= 6.5
browser = (logs / 'answer-equivalents-browser.log').read_text()
assert '[e2e-questions] OK (chromium)' in browser
receipt = json.loads(next(line.split('] ', 1)[1] for line in browser.splitlines()
                          if line.startswith('[question-equivalents]')))
assert receipt == dict(observations=5, rawPreserved=True, saved=True,
                       refusalPreserved=True, reload=True, mobileFits=True)
mcp = json.loads((logs / 'answer-equivalents-mcp-final.json').read_text())
assert not mcp.get('isError')
result = json.loads(re.search(r'### Result\n(\{[^\n]+\})', mcp['content'][0]['text'])[1])
assert result == dict(editedWordingReloaded=True, observations=5,
                      refusalPreservesDraft=True, noFalseConfirmation=True,
                      recoveredSavedAliases=True, compactFits=True)
reference_name = 'final-period-answer-preferences.test.mjs'
reference = json.loads((logs / (reference_name + '.json')).read_text())
data = base64.b64decode(reference['content'])
assert data == (logs / reference_name).read_bytes()
assert hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() == reference['sha']
command = ['git', 'diff', '--name-only', parent]
if revision:
    command.append(revision)
paths = subprocess.check_output(command, cwd=root, text=True).splitlines()
if not revision:
    paths += subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], cwd=root, text=True).splitlines()
read = lambda name: (subprocess.check_output(['git', 'show', f'{revision}:{name}'], cwd=root)
                     if revision else (root / name).read_bytes())
paths = sorted({name for name in paths if not name.startswith('docs/case-studies/issue-56/data/')})
hashes = {name: hashlib.sha256(read(name)).hexdigest() for name in paths}
entries = {name: read(name) for name in paths if not name.endswith(('.png', 'app.min.js'))}
for path in sorted(logs.glob('answer-equivalents-*')):
    if path.is_file() and path.suffix in ('.log', '.json') and not any(x in path.name for x in ('-commit', '-push', '-archive')):
        entries[str(path.relative_to(root))] = path.read_bytes()
entries['reference/' + reference_name] = data
entries['reference/' + reference_name + '.json'] = (logs / (reference_name + '.json')).read_bytes()
entries['before/js/src/automation/question-answers.js'] = subprocess.check_output(['git', 'show', f'{parent}:js/src/automation/question-answers.js'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(
    acceptance=False, scope='Partial QA11 explicit question-scoped wording and observed counts',
    parent=parent, revision=revision, distinctPortableTests=68,
    parentProbe='Exact prior planner/normalizer module; current dependencies retained',
    receipt=receipt, mcp=result, sourceHashes=hashes,
    reference=dict(pin='fa0991b8c2d0896fb3b4be6c69947f0590094b15', gitBlob=reference['sha']),
    pending='Complete reference/worker parity and exact-head hosted verification; all other unchecked criteria',
), indent=2) + '\n').encode()
writer = runpy.run_path(str(root / 'experiments/issue-56/evidence_bundle.py'))['write_entries_archive']
writer(root / 'docs/case-studies/issue-56/data/question-answer-equivalents.tar.gz', entries, len(hashes))
