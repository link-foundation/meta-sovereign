"""Assert the actual retained-document failure and collect reviewable evidence."""
from pathlib import Path
import json
import re
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
parent = 'd771106d1b338f714735a3601033905b27a1b276'
read = lambda suffix: (root / f'ci-logs/ci-question-disclosure-{suffix}.log').read_text()


def observation(text, name):
    return json.loads(next(line.split(' ', 1)[1] for line in text.splitlines()
                           if line.startswith(f'[{name}] ')))


before = read('before')
assert 'locator.click: Timeout 5000ms' in before
same = observation(before, 'question-same-url')
assert same['opened']['document'] == same['revisited']['document']
assert all(item['questionPanel']['open'] for item in same.values())
first = observation(before, 'question-first-mode')
final = observation(before, 'question-final-state')
assert first['document'] == final['document']
assert first['questionPanel']['open'] and not final['questionPanel']['open']
assert 'locator.click: Timeout 5000ms' in read('preview-before')
after = read('after')
assert '[e2e-question-disclosure] OK (chromium)' in after
first = observation(after, 'question-first-mode')
second = observation(after, 'question-second-mode')
assert first['document'] == second['document']
assert first['questionPanel']['open'] and second['questionPanel']['open']
assert observation(read('preview-after'), 'question-preview-reuse') == {'cases': 3}
assert '[e2e-hh-history] OK (chromium)' in read('history')
assert 'pass 21' in read('node') and 'fail 0' in read('node')
assert all(not read(name) for name in ['syntax', 'lint', 'secrets'])
assert 'All matched files use Prettier code style!' in read('format-check')
dup = re.sub(r'\x1b\[[0-9;]*m', '', read('duplication'))
total = next(line for line in dup.splitlines() if 'Total:' in line)
assert float(re.findall(r'\(([\d.]+)%\)', total)[0]) <= 6.5
mcp = json.loads((root / 'ci-logs/ci-question-disclosure-mcp-result.json').read_text())
assert not mcp.get('isError')
assert '"sameDocument":true' in json.dumps(mcp, separators=(',', ':')).replace('\\"', '"')
assert '"modelCalls":0,"sends":0' in read('mcp-server')
assert 'Learn from conversations' in read('parent-chromium')
assert 'ETIMEDOUT' in read('parent-chromium')
assert 'e2e-browser: cancelled' in read('parent-gate')
assert 'Passive notice' not in read('before')  # No label timeout after rebuilding.
raw = [f'ci-logs/cli-startup-imports-grandparent-{engine}.log'
       for engine in ['chromium', 'webkit']]
bundle(root, [*changed_sources(root, parent),
              *evidence_logs(root, 'ci-question-disclosure'), *raw],
       'docs/case-studies/issue-56/data/ci-question-disclosure.tar.gz', {
           'parent': parent, 'actual_parent_failures': 2, 'node_checks': 21,
           'notice_learning_modes': 2, 'disclosure_states': 3,
           'history_compatibility': True, 'mcp_errors': 0, 'sends': 0,
           'subprocess_budget_ms': 180000,
           'remaining': 'Exact-head hosted CI and all unchecked issue criteria.',
       }, 'issue-56-ci-question-disclosure/*.png', before={
           name: parent for name in ['js/tests/helpers/question-preview.mjs',
                                    'js/tests/helpers/e2e-notice-learning.mjs',
                                    'js/tests/helpers/e2e-hh-history.mjs',
                                    'js/src/web/app.min.js']
       })
