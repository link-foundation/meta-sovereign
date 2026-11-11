"""Check real prefill receipts, preserved owner values and bounded regression logs."""
import json
from pathlib import Path
from evidence_bundle import bundle
from forms_automatic_evidence import validate_automatic_capture

root = Path(__file__).resolve().parents[2]
prefix = root / 'ci-logs/forms-auto-prefill-'
checks = {
    'before.log': 'fail 2',
    'node.log': 'pass 30',
    'deno.log': '30 passed | 0 failed',
    'browser.log': 'OK (chromium)',
    'format-check.log': 'All matched files use Prettier code style!',
}
for suffix, expected in checks.items():
    assert expected in Path(f'{prefix}{suffix}').read_text(), suffix
assert not Path(f'{prefix}lint.log').read_text().strip()
assert 'ERROR: jscpd' not in Path(f'{prefix}duplication.log').read_text()
proof = json.loads(Path(f'{prefix}mcp.json').read_text())
assert proof['state'] == 'partial' and proof['receipts'] == 6
assert proof['closed'] and proof['nextPage'] and len(proof['uploads']) == 2
assert all(item['state'] == 'attached' and len(item['file']['sha256']) == 64
           for item in proof['uploads'])
assert len(proof['unresolved']) == 1
actual = json.loads(Path(f'{prefix}mcp-server.log').read_text().splitlines()[-1])
validate_automatic_capture(actual)
runs = json.loads(Path(f'{prefix}parent-runs.json').read_text())
parent = 'b12061261ee168d3a119e924e024d05e850584ea'
assert len(runs) == 5
assert all(run['headSha'] == parent and run['conclusion'] == 'success'
           for run in runs)
sources = Path(f'{prefix}changed-js.txt').read_text().splitlines()
sources += [f'ci-logs/forms-auto-prefill-{suffix}' for suffix in [
    *checks, 'lint.log', 'build.log', 'duplication.log', 'mcp.json',
    'mcp-server.log', 'parent-runs.json', 'parent-ci.json',
    'parent-checks-42940046522.log',
]]
sources += [
    'ci-logs/forms-timezone-reference-requirements.md',
    'ci-logs/forms-timezone-reference-head.json',
    'experiments/issue-56/verify-auto-prefill-before.py',
    'experiments/issue-56/collect-forms-automatic-prefill.py',
    'experiments/issue-56/forms_automatic_evidence.py',
    'docs/case-studies/issue-56/forms-automatic-prefill.md',
]
before = dict.fromkeys([
    'js/src/forms/reader.js', 'js/src/forms/review-prefill.js',
    'js/src/forms/review-sessions.js', 'js/src/forms/review-journal.js',
    'js/src/server/routes-form-reviews.js', 'js/src/cli/forms-review-commands.js',
], parent)
bundle(root, sources,
       'docs/case-studies/issue-56/data/forms-automatic-prefill.tar.gz',
       {'date': '2026-11-11', 'preceding_head': parent,
        'node': 30, 'deno': 30, 'mcp': proof, 'actual': actual,
        'remaining': 'Visual prefill controls, CAPTCHA/assignments, full provider parity and all unchecked issue requirements.'},
       'issue-56-forms-automatic-*.png', before=before)
