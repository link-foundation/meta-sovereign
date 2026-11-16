"""Preserve finite period regression and owned control verification evidence."""
import base64
import hashlib
import json
from pathlib import Path
import runpy
import subprocess

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
for name in ('final-period-focused.log', 'final-period-final-focused.log'):
    result = (logs / name).read_text()
    assert 'pass 32' in result and 'fail 0' in result, name
before = (logs / 'final-period-parent-regression.log').read_text()
assert 'tests 1' in before and 'fail 1' in before
assert "actual: 'Vietnam'" in before and "expected: 'Vietnam.'" in before
browser = (logs / 'final-period-browser.log').read_text()
assert '[e2e-questions] OK (chromium)' in browser
receipt = json.loads(next(line.split('] ', 1)[1] for line in browser.splitlines()
                          if line.startswith('[question-final-period]')))
assert receipt == dict(observations=5, defaultWith=True, configuredWithout=True,
                       rawPreserved=True, refusalPreserved=True, mobileFits=True)
assert not (logs / 'final-period-lint.log').read_text().strip()
duplication = (logs / 'final-period-duplication.log').read_text()
assert '6.49%' in next(line for line in duplication.splitlines() if 'Total:' in line)
assert 'ERROR:' not in duplication
references = {}
for path in sorted(logs.glob('final-period-*.mjs.json')):
    reference = json.loads(path.read_text())
    data = base64.b64decode(reference['content'])
    assert data == path.with_suffix('').read_bytes()
    blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    assert blob == reference['sha'] and len(data) == reference['size']
    references[reference['path']] = dict(gitBlob=blob, sha256=hashlib.sha256(data).hexdigest())
assert len(references) == 3
changed = subprocess.check_output(['git', 'diff', '--name-only'], cwd=root, text=True).splitlines()
changed += subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], cwd=root, text=True).splitlines()
sources = sorted({name for name in changed if not name.startswith('docs/case-studies/issue-56/data/')
                  and not name.endswith(('.png', 'app.min.js'))})
evidence = [str(path.relative_to(root)) for path in sorted(logs.glob('final-period-*'))
            if path.is_file() and path.suffix in ('.log', '.json', '.mjs')
            and not any(word in path.name for word in ('-commit', '-push', '-archive'))]
entries = {name: (root / name).read_bytes() for name in sources + evidence}
entries['before/js/src/automation/question-policy.js'] = subprocess.check_output(
    ['git', 'show', 'c389341e:js/src/automation/question-policy.js'], cwd=root)
metadata = dict(
    parent='c389341e', acceptance=False,
    scope='QA11 observed final-period pairs; approved wording count reconciliation remains required',
    parentProbe='Exact prior policy module loaded by a finite Node module hook; one selected current regression',
    distinctPortableTests=57, receipt=receipt, referencePin='fa0991b8c2d0896fb3b4be6c69947f0590094b15',
    references=references,
    sources={name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in sources},
    generatedBundleSha256=hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest(),
    screenshots={path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                 for path in sorted((root / 'docs/screenshots').glob('issue-56-final-period-*.png'))},
)
entries['metadata.json'] = (json.dumps(metadata, indent=2) + '\n').encode()
write = runpy.run_path(str(root / 'experiments/issue-56/evidence_bundle.py'))['write_entries_archive']
write(root / 'docs/case-studies/issue-56/data/question-final-period.tar.gz', entries, len(sources))
