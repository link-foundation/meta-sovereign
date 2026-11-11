"""Retain parent reproduction, notice delivery boundaries and shared UI evidence."""
import json
from pathlib import Path
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
parent = 'cdbfeaf1'
read = lambda name: (root / f'ci-logs/notice-policy-{name}.log').read_text()
assert 'Actual parent does not retain independent saved notice policies.' in read('before')
assert 'fail 1' in read('before')
before_ui = json.loads(read('ui-before').splitlines()[-1])
assert before_ui['missingNoticePolicies'] and before_ui['providerSends'] == 0
assert 'pass 21' in read('node') and 'fail 0' in read('node')
assert 'pass 2' in read('restart') and 'fail 0' in read('restart')
assert '17 passed | 0 failed' in read('deno')
assert 'pass 44' in read('compatibility') and 'fail 0' in read('compatibility')
assert read('browser').count('PASS ') == 7 and '"cases":7' in read('browser')
ui = json.loads(read('ui').splitlines()[-1])
assert ui['cases'] == 4 and ui['providerSends'] == 1 and not ui['pageErrors']
mcp = json.loads((root / 'ci-logs/notice-policy-mcp-result.json').read_text())
assert mcp['cases'] == 3 and mcp['opens'] == mcp['sends'] == 0
assert not mcp['pageErrors'] and not mcp['nativeProvider'] and not mcp['liveProvider']
assert not read('lint') and not read('secrets')
assert 'All matched files use Prettier code style!' in read('format-check')
assert '38690 (6.49%)' in read('duplication') and 'ERROR' not in read('duplication')
bundle(root, [
    *changed_sources(root, parent),
    *(name for name in evidence_logs(root, 'notice-policy')
      if not any(part in name for part in ['windows-', '-pipeline-', '-runs.', '-current-ci.'])),
    'ci-logs/notice-policy-mcp-code.js',
    'experiments/issue-56/question-browser-probe.mjs',
    'experiments/issue-56/text-reply-fixture.mjs',
    'experiments/issue-56/provider-choice-fixture.mjs',
    'experiments/issue-56/conversation-history-fixture.mjs',
], 'docs/case-studies/issue-56/data/notice-policy.tar.gz', {
    'parent': parent, 'local_fixture_only': True, 'live_provider': False,
    'node_checks': 23, 'deno_checks': 17, 'compatibility_checks': 44,
    'native_browser_cases': 7, 'production_ui_cases': 4,
    'independent_mcp_ui_cases': 3, 'mcp_native_provider': False,
    'remaining': 'Hosted verification, cross-chat/filter restoration, unread orchestration, live provider verification and every unchecked criterion.',
}, 'issue-56-notice-policy/*.png', before={
    'js/src/automation/question-policy.js': parent,
    'js/src/web/question-policy.js': parent,
    'js/src/web/question-browser-watch-controls.js': parent,
    'js/src/web/app.css': parent,
})
