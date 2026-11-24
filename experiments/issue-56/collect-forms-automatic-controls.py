"""Retain verified UI prefill/recovery evidence without running a full suite."""
import json
from pathlib import Path
from evidence_bundle import bundle
from forms_automatic_evidence import validate_automatic_capture

root = Path(__file__).resolve().parents[2]
prefix = root / 'ci-logs/forms-automatic-controls-'
checks = {
    'before.log': 'fail 1',
    'node.log': 'pass 43',
    'deno.log': '43 passed | 0 failed',
    'browser-before.log': 'prefill-form',
    'browser.log': 'OK (chromium)',
    'format-check.log': 'All matched files use Prettier code style!',
}
for suffix, expected in checks.items():
    assert expected in Path(f'{prefix}{suffix}').read_text(), suffix
assert not Path(f'{prefix}lint.log').read_text().strip()
assert 'ERROR: jscpd' not in Path(f'{prefix}duplication.log').read_text()
browser = Path(f'{prefix}browser.log').read_text()
assert '"receipts":6,"uploads":2' in browser
assert '"nextClicks":0,"submits":0,"closed":true' in browser
proof = json.loads(Path(f'{prefix}mcp.json').read_text())
assert proof['state'] == 'partial' and proof['receipts'] == 6
assert proof['closed'] and proof['nextPage'] and not proof['submissionAttempted']
assert len(proof['uploads']) == 2 and len(proof['unresolved']) == 1
assert all(u['state'] == 'attached' and len(u['file']['sha256']) == 64
           for u in proof['uploads'])
actual = json.loads(Path(f'{prefix}mcp-server.log').read_text().splitlines()[-1])
validate_automatic_capture(actual, expected_reviews=1)
sources = Path(f'{prefix}changed-js.txt').read_text().splitlines()
sources += [f'ci-logs/forms-automatic-controls-{suffix}' for suffix in [
    *checks, 'lint.log', 'build.log', 'duplication.log', 'mcp.json',
    'mcp-server.log', 'parent-runs.json', 'parent-ci.json',
]]
sources += [
    'experiments/issue-56/verify-automatic-controls-before.py',
    'experiments/issue-56/collect-forms-automatic-controls.py',
    'experiments/issue-56/forms_automatic_evidence.py',
    'docs/case-studies/issue-56/forms-automatic-controls.md',
]
parent = '08411c499d522ecabc497a8676a29043a46f5e84'
bundle(root, sources,
       'docs/case-studies/issue-56/data/forms-automatic-controls.tar.gz',
       {'date': '2026-11-11', 'preceding_head': parent,
        'node': 43, 'deno': 43, 'mcp': proof, 'actual': actual,
        'remaining': 'CAPTCHA, assignments, discovery, chat/model automation, full provider parity and all unchecked issue requirements.'},
       'issue-56-forms-automatic-controls-*.png',
       before={'js/src/web/forms-plan-controls.js': parent})
