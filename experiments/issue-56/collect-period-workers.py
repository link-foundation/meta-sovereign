"""Preserve finite worker-setting regressions and source-bound verification."""
import hashlib
import json
import re
import runpy
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[2]
helper = runpy.run_path(str(root / 'experiments/issue-56/evidence_bundle.py'))
root, logs, read = helper['evidence_context'](__file__, 'period-workers')
parent = '83c5b1f7e75d2b2ea5426d2ec039ec98a48f13ca'
assert 'tests 7' in read('parent-all') and 'fail 7' in read('parent-all')
assert 'tests 49' in read('focused-final') and 'fail 0' in read('focused-final')
assert 'tests 1' in read('ci-contract') and 'pass 1' in read('ci-contract')
assert not read('lint-final').strip() and not read('diff').strip()
assert 'All matched files use Prettier code style!' in read('format-check')
total = next(line for line in read('duplication').splitlines() if 'Total:' in line)
assert float(re.search(r'\((\d+\.\d+)%\)', total)[1]) <= 6.5
assert 'ERROR:' not in read('duplication')
assert "+   draft: 'Vietnam.'" in read('browser-parent-corrected')
assert '[e2e-question-controls] OK (chromium)' in read('browser-final')
receipt = json.loads(next(line.split('] ', 1)[1] for line in read('browser-final').splitlines()
                          if line.startswith('[question-period-workers]')))
assert receipt == dict(overrideRetained=True, draft='Vietnam', sends=0, observations=5)
names = helper['changed_sources'](root, parent)
hashes = {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in names}
entries = {name: (root / name).read_bytes() for name in names
           if not name.endswith(('.png', 'app.min.js'))}
for name in helper['evidence_logs'](root, 'period-workers'):
    entries[name] = (root / name).read_bytes()
for name in [name for name in names if name.startswith('js/src/') and name.endswith('.js')]:
    entries['before/' + name] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
for name in ['7001-pipeline-failed.log', '7001-browser-cancel.log',
             '7001-browser-cancel-annotations.json', '7001-run-metadata.json',
             '83c5-browser-133664238751.log', '83c5-browser-133664238751.json']:
    entries['ci-logs/' + name] = (logs / name).read_bytes()
entries['metadata.json'] = (json.dumps(dict(
    acceptance=False, scope='Partial QA11 worker final-period configuration', parent=parent,
    distinctPortableTests=49, registrationContracts=1, receipt=receipt, sourceHashes=hashes,
    parentHooks='Two exact parent modules, with current dependencies; seven failures',
    boundary='Routed synthetic provider and mock adapter; no authenticated provider send',
    historicalCI='7001 dependencies cancelled for higher-priority waiting request; pipeline lines 98-101',
    pending='83c5 shared browser failure investigation, complete QA11 audit and exact-source hosted verification; every other unchecked criterion',
), indent=2) + '\n').encode()
helper['write_entries_archive'](root / 'docs/case-studies/issue-56/data/question-period-workers.tar.gz',
                                entries, len(hashes))
