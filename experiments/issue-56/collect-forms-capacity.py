"""Retain bounded capacity evidence with the shared verified archive writer."""
import json
from evidence_bundle import bundle
from pathlib import Path

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'pass 47' in (logs / 'forms-capacity-tests.log').read_text()
assert '47 passed | 0 failed' in (logs / 'forms-capacity-deno.log').read_text()
assert not (logs / 'forms-capacity-lint.log').read_text().strip()
before = (logs / 'forms-capacity-before.log').read_text()
assert 'Review one to four form URLs' in before and 'Use finite form review limits' in before
browser = (logs / 'forms-capacity-browser-after.log').read_text()
assert 'OK (chromium)' in browser
receipt = json.loads(next(line.split('] ', 1)[1] for line in browser.splitlines()
                          if line.startswith('[forms-capacity]')))
assert receipt == dict(saved=17, persisted=True, refusal=True, staleInput='19',
                       ownerPreserved=True, closed=True, submits=0)
mcp = json.loads((logs / 'forms-capacity-mcp.json').read_text())
assert mcp == dict(value='17', sessions=0, persisted=True, phoneFits=True, closed=True)

names = [f'ci-logs/forms-capacity-{suffix}' for suffix in (
    'tests.log', 'deno.log', 'lint.log', 'format.log', 'build.log',
    'before.log', 'browser-before.log', 'browser-after.log', 'mcp.json',
    'parent-runs-current.json', 'parent-checks-current.json')]
names += ['ci-logs/question-summary-reference-requirements.md',
          'experiments/issue-56/forms-capacity-baseline.py',
          'experiments/issue-56/forms-reader-ui.mjs',
          'experiments/issue-56/collect-forms-capacity.py',
          'experiments/issue-56/archive-evidence.py',
          'docs/case-studies/issue-56/forms-review-capacity.md']
names += (logs / 'forms-capacity-changed-code.txt').read_text().splitlines()
metadata = {
    'date': '2026-11-10', 'preceding_head': '482784609a3143c623a3b3875b71d89448618f32',
    'node_checks': 47, 'deno_tests': 47,
    'browser': receipt, 'mcp': mcp,
    'remaining': 'B1 automatic prefill and all other unchecked issue-wide criteria remain required',
}
bundle(root, names, 'docs/case-studies/issue-56/data/forms-review-capacity.tar.gz',
       metadata, 'issue-56-forms-capacity-*.png')
