"""Assert persistent text admission, bounded native effects and compatibility."""
import json
from pathlib import Path
import re
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
parent = '9ca1c99789f0224497a159408e501266b2eba556'
read = lambda name: (root / f'ci-logs/question-text-{name}.log').read_text()
assert 'fail 1' in read('before') and 'textSources' not in read('before')
assert 'actual: undefined' in read('before')
assert 'pass 13' in read('focused') and 'fail 0' in read('focused')
assert 'pass 45' in read('compatibility') and 'fail 0' in read('compatibility')
observations = [json.loads(line) for line in read('browser').splitlines()]
assert observations[-1] == {'cases': 5, 'result': 'PASS'}
for value in observations[:2]:
    assert value['before'] == {'clicks': 0, 'textSends': 1, 'draft': ''}
assert observations[2]['stats']['textSends'] == 1
assert observations[3]['stats'] == {'clicks': 0, 'textSends': 0, 'draft': 'Owner draft survives'}
assert observations[4]['code'] == 'answer-text-changed'
assert observations[4]['stats'] == {'clicks': 0, 'textSends': 0, 'draft': ''}
assert all(not read(name) for name in ['eslint', 'secrets', 'syntax'])
assert 'All matched files use Prettier code style!' in read('format-check')
duplication = re.sub(r'\x1b\[[0-9;]*m', '', read('duplication'))
total = next(line for line in duplication.splitlines() if 'Total:' in line)
assert float(re.findall(r'\(([\d.]+)%\)', total)[0]) <= 6.5
bundle(root, [*changed_sources(root, parent), *evidence_logs(root, 'question-text')],
       'docs/case-studies/issue-56/data/question-text.tar.gz', {
           'parent': parent, 'actual_parent_failures': 1, 'node_checks': 13,
           'node_compatibility_checks': 45, 'production_chromium_cases': 5,
           'live_provider': False,
           'remaining': 'Visible shared text controls, independent UI/MCP evidence, background text decisions, unread orchestration, live-provider verification and all unchecked issue criteria.',
       }, 'issue-56-question-text/*.png', before={
           name: parent for name in ['js/src/automation/question-browser.js',
                                    'js/src/automation/outbox.js',
                                    'js/src/automation/question-choice-key.js',
                                    'js/src/server/routes-question-browser.js']
       })
