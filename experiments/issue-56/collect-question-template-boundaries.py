"""Preserve the failing and corrected saved-template plan and browser receipts."""
from hashlib import sha256
import json
import subprocess

from evidence_bundle import evidence_context, write_entries_archive


root, _, read = evidence_context(__file__, 'question-template-boundary')
parent = '0812c89de54785f34cb220dcabd5ef17f2a4f98b'
matcher = 'js/src/automation/question-match.js'
before = read('node-before')
assert 'fail 3' in before and "actual: 'template'" in before
assert 'pass 60' in read('node') and 'fail 0' in read('node')
assert '60 passed | 0 failed' in read('deno')
assert 'newRequestRequiresReview":false' in read('browser-before')
assert 'separateQuestionRequiresReview":true' in read('browser-after')
for phase in ('before', 'after'):
    assert 'pageErrors":[]' in read(f'browser-{phase}')
    assert 'nativeSends":0' in read(f'browser-{phase}')
mcp = json.loads(read('mcp').split('### Result\n')[1].split('\n###')[0])
assert mcp['draft'] == '' and mcp['sendDisabled'] and not mcp['overflow']
assert mcp['exceptions'] == [] and not mcp['liveProvider']
assert json.loads(read('mcp-server').splitlines()[-1]) == dict(
    resourcesClosed=True, stats=dict(clicks=0, textSends=0, draft=''), liveProvider=False)
assert read('mcp-network').count('[POST]') == 2
assert '/answers/save' in read('mcp-network') and '/browser/inspect' in read('mcp-network')
assert not read('lint').strip() and not read('secrets').strip()

sources = [
    matcher,
    'js/tests/e2e-question-templates-browser.mjs',
    'js/tests/helpers/e2e-question-templates.mjs',
    'js/tests/question-template-links.test.js',
    'js/tests/question-template-workflows.test.js',
    'experiments/issue-56/collect-question-template-boundaries.py',
    'experiments/issue-56/evidence_bundle.py',
    'experiments/issue-56/question-template-boundary-mcp.mjs',
    'experiments/issue-56/question-template-fixture.mjs',
    'experiments/issue-56/question-template-request-browser.mjs',
    'experiments/issue-56/question-templates-mcp-server.mjs',
]
entries = {name: (root / name).read_bytes() for name in sources}
entries['before/' + matcher] = subprocess.check_output(
    ['git', 'show', f'{parent}:{matcher}'], cwd=root)
for name in ('node-before', 'node', 'deno', 'browser-before', 'browser-after',
             'mcp', 'mcp-network', 'mcp-console', 'mcp-server', 'lint', 'secrets',
             'format-check', 'build'):
    entries[f'ci-logs/question-template-boundary-{name}.log'] = read(name).encode()
screenshots = sorted((root / 'docs/screenshots/issue-56-template-boundaries').glob('*.png'))
assert len(screenshots) == 4
entries['metadata.json'] = (json.dumps(dict(
    parent=parent, criterion='QA04', criterionComplete=False, hostedChecksPending=True,
    nodeChecks=60, denoChecks=60, nativeSends=0, liveProvider=False,
    webBundleSha256=sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest(),
    screenshots={p.name: sha256(p.read_bytes()).hexdigest() for p in screenshots},
), indent=2) + '\n').encode()
write_entries_archive(
    root / 'docs/case-studies/issue-56/data/question-template-boundaries.tar.gz',
    entries, len(sources))
