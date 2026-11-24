"""Preserve reviewed-text UI admission, native effects and independent MCP proof."""
import json
from pathlib import Path
import re
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
parent = 'c446791d046eca9a17b16f365dbfa25180b901cf'
read = lambda name: (root / f'ci-logs/question-text-ui-{name}.log').read_text()
assert 'A free-text review needs an editable reviewed reply' in read('before')
assert 'fail 1' in read('draft-before') and 'Edited after refusal' in read('draft-before')
assert 'actual: 0' in read('before') and 'expected: 1' in read('before')
assert 'pass 22' in read('focused') and 'fail 0' in read('focused')
assert 'pass 49' in read('compatibility') and 'fail 0' in read('compatibility')
for name, count in [('browser', 13), ('native-compatibility', 16)]:
    observation = json.loads(read(name).splitlines()[-1])
    assert observation == {'cases': count, 'pageErrors': [], 'liveProvider': False}
mcp = json.loads((root / 'ci-logs/question-text-ui-mcp-final.json').read_text())
result = next(block['text'] for block in mcp['content'] if block['type'] == 'text')
result = json.loads(result.split('### Result\n')[1].split('\n### Ran Playwright code')[0])
assert len(result['cases']) == 7 and result['pageErrors'] == []
assert result['senderStub'] is True and result['liveProvider'] is False
assert result['ordinarySends'] == result['prefills'] == 0 and result['textReplies'] == 1
assert all(not read(name) for name in ['eslint', 'secrets', 'syntax'])
assert 'All matched files use Prettier code style!' in read('format-check')
duplication = re.sub(r'\x1b\[[0-9;]*m', '', read('duplication'))
total = next(line for line in duplication.splitlines() if 'Total:' in line)
assert 'ERROR' not in duplication
columns = [column.strip() for column in total.split('│') if column.strip()]
assert int(columns[5].split()[0]) / int(columns[2]) * 100 <= 6.5
ci = json.loads((root / 'ci-logs/question-text-ui-backend-checks-final.json').read_text())
assert ci['headSha'] == parent
assert not [job for job in ci['jobs'] if job['conclusion'] not in ['', 'success', 'skipped']]
bundle(root, [*changed_sources(root, parent), *evidence_logs(root, 'question-text-ui'),
              'ci-logs/question-text-ui-telegram-reference.ts',
              'ci-logs/question-text-ui-t3-reference.tsx',
              'ci-logs/question-text-ui-draft-before.js'],
       'docs/case-studies/issue-56/data/question-text-ui.tar.gz', {
           'parent': parent, 'actual_parent_failures': 1, 'node_checks': 22,
           'node_compatibility_checks': 49, 'production_chromium_cases': 13,
           'native_choice_compatibility_cases': 16, 'independent_mcp_cases': 7,
           'mcp_sender_stub': True, 'live_provider': False,
           'remaining': 'Exact UI-head CI, background text decisions, inactive-owner restoration, unread orchestration, live-provider verification and every unchecked issue criterion.',
       }, 'issue-56-question-text-ui/*.png', before={
           name: parent for name in ['js/src/web/question-browser-controls.js',
                                    'js/src/web/dom-automation-calls.js',
                                    'js/src/web/app.min.js']
       })
