"""Verify matching controls, complete eligible pages and actual selected writes."""
import json
from pathlib import Path
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
prefix = root / 'ci-logs/question-matching-'
checks = {'before.log': 'fail 8', 'focused-node.log': 'pass 45',
          'focused-deno.log': '45 passed | 0 failed',
          'compatibility.log': 'pass 21', 'browser-after.log': 'OK (chromium)',
          'forms-browser.log': 'OK (chromium)',
          'format-check.log': 'All matched files use Prettier code style!'}
for suffix, expected in checks.items():
    assert expected in Path(f'{prefix}{suffix}').read_text(), suffix
for suffix in ['lint.log', 'helper-lint.log']:
    assert not Path(f'{prefix}{suffix}').read_text().strip(), suffix
assert 'ERROR: jscpd' not in Path(f'{prefix}duplication.log').read_text()
proof = json.loads(Path(f'{prefix}mcp.json').read_text())
assert proof['firstPage'] == 10 and len(proof['last']) == 2
assert all('Similarity: 72.73%' in row for row in proof['last'])
assert proof['receipts'] == 1 and proof['reviewClosed'] and not proof['phoneOverflow']
actual = json.loads(Path(f'{prefix}mcp-server.log').read_text().splitlines()[-1])
assert actual['submissions'] == 0 and len(actual['reads']) == 1
assert actual['reads'][0]['values'] == {'city': 'Hanoi, district 12.',
    'caseCity': '', 'ownerCity': 'Owner keeps this city'}
assert actual['reads'][0]['closed']
source_files = Path(f'{prefix}changed-js.txt').read_text().splitlines()
source_files.extend(f'ci-logs/question-matching-{suffix}' for suffix in [
    *checks, 'browser-before.log', 'lint.log', 'helper-lint.log', 'build.log',
    'duplication.log', 'mcp.json', 'mcp-console.log', 'mcp-server.log',
    'reference-prs.json', 'current-runs.json', 'main-fetch.log'])
source_files += ['ci-logs/forms-subject-reference-pr123.json',
                 'ci-logs/forms-timezone-reference-head.json',
                 'docs/case-studies/issue-56/question-matching-options.md',
                 'experiments/issue-56/collect-question-matching.py']
prior = dict.fromkeys(['js/src/automation/question-match.js',
    'js/src/automation/question-answers.js', 'js/src/automation/question-corrections.js',
    'js/src/automation/question-turns.js', 'js/src/web/question-controls.js'], 'c3912720')
bundle(root, source_files, 'docs/case-studies/issue-56/data/question-matching-options.tar.gz',
       {'date': '2026-11-11', 'preceding_head': 'c39127200aaa7822d3fdbc7a34f993f0df205c05',
        'node': 45, 'deno': 45, 'compatibility': 21, 'mcp': proof, 'readback': actual,
        'remaining': 'Full weighted fuzzy rewording, provider history/execution and all unchecked criteria.'},
       'issue-56-*matching*.png', before=prior)
