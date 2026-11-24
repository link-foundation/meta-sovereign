"""Archive bounded chat-model regressions and actual production UI observations."""
import json
from pathlib import Path
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
expected = {
    'before.log': 'fail 4',
    'browser-before.log': 'model drafts the unanswered part',
    'baseline.log': 'Four parent regressions',
    'choices-before.log': "- 'answer-changed'",
    'choices-baseline.log': 'fails without the options binding',
    'tests.log': 'pass 65',
    'deno.log': '65 passed | 0 failed',
    'browser.log': 'OK (chromium)',
    'format-check.log': 'All matched files use Prettier code style!',
}
for name, text in expected.items():
    assert text in (logs / f'chat-model-{name}').read_text(), name
assert not (logs / 'chat-model-lint.log').read_text().strip()
assert not (logs / 'chat-model-diff-check.log').read_text().strip()
assert 'ERROR: jscpd' not in (logs / 'chat-model-duplication.log').read_text()
browser = (logs / 'chat-model-browser.log').read_text()
receipt = json.loads(next(line.split('] ', 1)[1] for line in browser.splitlines()
                          if line.startswith('[chat-model]')))
assert receipt == dict(modelCalls=2, queued=1, ownerEditRetained=True,
                       sends=0, phoneOverflow=False)
mcp = json.loads((logs / 'chat-model-mcp.json').read_text())
assert mcp['refusedVisible'] and mcp['ownerEditRetained'] and not mcp['phoneOverflow']
assert mcp['actual'] == mcp['recovered'] == (
    '1. My English level is B2.\n2. I build accessible browser interfaces.')
server = json.loads((logs / 'chat-model-mcp-server.log').read_text().splitlines()[-1])
assert server == dict(issued=3, modelCalls=2, sends=0)
sources = (logs / 'chat-model-changed-code.txt').read_text().splitlines()
sources += [f'ci-logs/chat-model-{name}' for name in [
    *expected, 'lint.log', 'diff-check.log', 'duplication.log', 'build.log',
    'mcp.json', 'mcp-server.log', 'parent-runs-current.json',
    'issue-comments-current.json', 'pr-comments-current.json',
    'pr-inline-current.json', 'pr-reviews-current.json',
    'turn-before-choices.js', 'changed-code.txt',
]]
sources += [
    'ci-logs/forms-timezone-reference-requirements.md',
    'experiments/issue-56/chat-model-before.py',
    'experiments/issue-56/chat-model-choices-before.py',
    'experiments/issue-56/chat-model-mcp-server.mjs',
    'experiments/issue-56/chat-model-mcp.mjs',
    'experiments/issue-56/collect-chat-model.py',
    'docs/case-studies/issue-56/chat-model-drafts.md',
    'package.json', 'js/scripts/browser-checks.json',
]
parent = '7034426b14f6e79e3d6cb966141b19cb4f1da045'
bundle(root, sources, 'docs/case-studies/issue-56/data/chat-model-drafts.tar.gz',
       dict(date='2026-11-11', preceding_head=parent, node=65, deno=65,
            browser=receipt, mcp=mcp, actual=server, live_provider_verified=False,
            remaining='Live provider/model workflows, full matching, assignments and every unchecked issue criterion.'),
       'issue-56-chat-model-*.png', before={
           'js/src/automation/automations.js': parent,
           'js/src/automation/answer-model-preview.js': parent,
           'js/src/automation/question-answers.js': parent,
       })
