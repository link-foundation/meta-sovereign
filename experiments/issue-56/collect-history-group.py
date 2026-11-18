"""Retain mandatory history coverage and the actual subprocess deadline evidence."""
from pathlib import Path
import re
import subprocess
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
parent = '4c58bbb19deead3d3fd2c349ec825012bf1d3a33'
read = lambda suffix: (root / f'ci-logs/ci-question-history-{suffix}.log').read_text()
assert 'fail 1' in read('before') and 'AssertionError [ERR_ASSERTION]: question-history' in read('before')
assert 'fail 1' in read('overlap-before') and 'runs in exactly one bounded group' in read('overlap-before')
assert 'pass 18' in read('node') and 'fail 0' in read('node')
assert not read('syntax') and not read('lint') and not read('secrets')
assert 'All matched files use Prettier code style!' in read('format-check')
duplication = re.sub(r'\x1b\[[0-9;]*m', '', read('duplication'))
total = next(line for line in duplication.splitlines() if 'Total:' in line)
assert float(re.findall(r'\(([\d.]+)%\)', total)[0]) <= 6.5
scenario = 'js/tests/helpers/e2e-conversation-history.mjs'
assert (root / scenario).read_bytes() == subprocess.check_output(
    ['git', 'show', f'{parent}:{scenario}'], cwd=root)
raw = [f'ci-logs/cli-startup-imports-grandparent-{engine}.log'
       for engine in ('chromium', 'webkit')]
for name in raw:
    text = (root / name).read_text()
    assert 'verifyHhChatScan' in text and 'verifyConversationHistory' in text
    assert 'ETIMEDOUT' in text
bundle(root, [*changed_sources(root, parent), scenario,
              *evidence_logs(root, 'ci-question-history'), *raw,
              'ci-logs/ci-question-history-artifacts/ms-e2e-questions-chromium.png'],
       'docs/case-studies/issue-56/data/ci-history-group.tar.gz', {
           'parent': parent, 'actual_parent_failure': 1, 'intermediate_duplicate_failure': 1,
           'node_checks': 18, 'scenario_unchanged': scenario,
           'subprocess_budget_ms': 180000, 'job_budget_minutes': 35,
           'remaining': 'Hosted group execution, Questions disclosure, startup confirmation and all unchecked criteria.',
       }, 'no-history-group-ui-changes/*', before={
           name: parent for name in ['package.json', 'js/scripts/browser-checks.json',
                                    'js/tests/e2e-question-chat-lists-browser.mjs', scenario]
       })
