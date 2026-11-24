"""Preserve explicit instruction acquisition, parent regressions and browser proof."""
from pathlib import Path
import json
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
assert 'pass 58' in (root / 'ci-logs/assignment-source-node.log').read_text()
assert '53 passed | 0 failed' in (root / 'ci-logs/assignment-source-deno.log').read_text()
assert 'fail 4' in (root / 'ci-logs/assignment-source-before.log').read_text()
assert '[e2e-forms-reader] OK (chromium)' in (root / 'ci-logs/assignment-source-browser.log').read_text()
assert '6.48%' in (root / 'ci-logs/assignment-source-duplication.log').read_text()
for name in ['lint', 'secretlint']:
    assert not (root / f'ci-logs/assignment-source-{name}.log').read_text().strip()
observed = json.loads((root / 'ci-logs/assignment-source-mcp-after-fixture.log').read_text().splitlines()[-1])
assert observed['submissions'] == 0
assert len(observed['sourceReads']) == 1 and observed['sourceReads'][0]['closed']
assert all(row['closed'] for row in observed['reads'])
assert observed['publication']['modelCalls'] == 1
assert observed['publication']['repositories'] == observed['publication']['issues'] == 0
assert not any(call in observed['publication']['calls'] for call in ['create', 'create-issue'])
files = json.loads((root / 'ci-logs/assignment-source-review-files.json').read_text())
bundle(root, [
    *[name for name in files if not name.endswith('.png')],
    'js/src/assignments/commands.js',
    'js/tests/assignment-template-history.test.js',
    'experiments/issue-56/collect-assignment-source.py',
    'ci-logs/assignment-source-mcp-after.json',
    'ci-logs/assignment-source-review-files.json',
    *[f'ci-logs/assignment-source-{name}.log' for name in [
        'node', 'deno', 'before', 'before-summary', 'browser', 'build-web',
        'lint', 'format', 'secretlint', 'duplication',
        'mcp-before-fixture', 'mcp-after-fixture']],
], 'docs/case-studies/issue-56/data/assignment-source.tar.gz', {
    'node': 58, 'deno': 53, 'before_failures': 4,
    'mcp': observed,
    'remote_writes': 'Synthetic adapters only; no actual GitHub publication.',
    'remaining': 'Automatic document discovery, other document formats, full assignment implementation/handoff/notifications, authenticated provider/model execution, current-head CI and every unchecked issue requirement.',
}, 'issue-56-assignment-source-*.png', before={
    name: '9feb1d62fd70f48fbe9d1e4e191bb2877f59e03d' for name in [
        'js/src/assignments/draft.js', 'js/src/assignments/service.js',
        'js/src/web/form-assignment-publisher.js',
    ]
})
