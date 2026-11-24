"""Preserve assignment holds, real browser readback and bounded verification."""
import json
from pathlib import Path
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
prefix = root / 'ci-logs/forms-assignment-'
expected = {
    'before.log': 'fail 3',
    'browser-before.log': 'assignment holds every answer before a repository exists',
    'node.log': 'pass 95',
    'deno.log': '95 passed | 0 failed',
    'browser.log': 'OK (chromium)',
    'format-check.log': 'All matched files use Prettier code style!',
}
for suffix, text in expected.items():
    assert text in Path(f'{prefix}{suffix}').read_text(), suffix
assert not Path(f'{prefix}lint.log').read_text().strip()
assert 'ERROR: jscpd' not in Path(f'{prefix}duplication.log').read_text()
proof = json.loads(Path(f'{prefix}mcp.json').read_text())
values = {'name': 'Owner keeps this text', 'english': 'B2',
          'task': 'https://github.com/fixture-owner/reviewed-task', 'github': ''}
assert proof == {'heldProposals': 0, 'refusal': 'form-assignment-required',
                 'refusedWrites': 0, 'refusedUploads': 0, 'applied': 2,
                 'readback': values, 'failurePreserved': True, 'closed': True}
actual = json.loads(Path(f'{prefix}mcp-server.log').read_text().splitlines()[-1])
assert actual['submissions'] == 0 and len(actual['reads']) == 1
assert actual['reads'][0]['closed']
assert actual['reads'][0]['assignment'] == {'values': values, 'uploads': 0, 'submissions': 0}
assert all(request['method'] == 'GET' for request in actual['requests'])
sources = Path(f'{prefix}changed-js.txt').read_text().splitlines()
sources += [f'ci-logs/forms-assignment-{suffix}' for suffix in [
    *expected, 'lint.log', 'build.log', 'duplication.log', 'mcp.json',
    'mcp-server.log',
]]
sources += ['ci-logs/assignment-parent-runs.json', 'package.json', 'js/scripts/browser-checks.json',
            'experiments/issue-56/forms-assignment-before.py',
            'experiments/issue-56/collect-forms-assignment.py',
            'docs/case-studies/issue-56/forms-assignment-prerequisite.md']
parent = '50ddab328ff15b8185ce993681d1bf5905c4aaa4'
bundle(root, sources,
       'docs/case-studies/issue-56/data/forms-assignment-prerequisite.tar.gz',
       {'date': '2026-11-11', 'preceding_head': parent,
        'node': 95, 'deno': 95, 'mcp': proof, 'actual': actual,
        'remaining': 'Automatic assignment publishing, templates, vacancy association, deliverables and every unchecked issue criterion.'},
       'issue-56-forms-assignment-*.png', before={
           'js/src/forms/answer-plan.js': parent,
           'js/src/forms/review-upload.js': parent,
           'js/src/forms/automatic-prefill.js': parent})
