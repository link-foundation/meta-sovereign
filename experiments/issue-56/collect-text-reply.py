"""Preserve actual-parent, native delivery, ownership and independent MCP evidence."""
import json
from pathlib import Path
import re
import subprocess
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
read = lambda name: (root / f'ci-logs/text-reply-{name}.log').read_text()
assert 'fail 1' in read('before-node') and "'undefined'" in read('before-node')
assert 'unavailableBefore' in read('before-browser')
assert 'fail 1' in read('ci-before') and 'question-text-replies' in read('ci-before')
assert 'pass 28' in read('unit') and 'fail 0' in read('unit')
assert 'AssertionError' in read('reservation-draft-before')
assert '"cases":3' in read('reservations-browser')
assert '"cases":20' in read('reservation-compatibility')
for name, count in [('controls', 21), ('guards', 15)]:
    value = read(f'{name}-browser')
    assert f'"cases":{count}' in value and '"phase":"passed"' in value
    assert '] OK (chromium)' in value
compatibility = read('provider-browser')
for name, count in [('verifyProviderChoices', 20), ('verifyHhChoices', 25), ('verifyChoiceVisibility', 11)]:
    assert any(f'"scenario":"{name}"' in line and '"phase":"passed"' in line
               and f'"cases":{count}' in line for line in compatibility.splitlines())
assert not read('lint') and not read('secrets')
assert 'All matched files use Prettier code style!' in read('format-check')
duplication = re.sub(r'\x1b\[[0-9;]*m', '', read('duplication'))
total = next(line for line in duplication.splitlines() if 'Total:' in line)
assert float(re.findall(r'\(([\d.]+)%\)', total)[0]) <= 6.5
mcp = json.loads((root / 'ci-logs/text-reply-mcp-result.json').read_text())
result = json.loads(mcp['content'][0]['text'].split('### Result\n', 1)[1].split('\n### Ran', 1)[0])
assert len(result['outcomes']) == 5 and not result['errors'] and not result['liveProvider']
security = json.loads((root / 'ci-logs/text-reply-security-followup.json').read_text())
assert security['conclusion'] == 'success'
parent = 'ff7a9d711fcde7f556a9105350282aed6a731220'
before = '1a35532cb2c87593cb887ebaec0e4e45f221d72b'
names = [f'js/src/sources/{name}.js' for name in (
    'browser-sender', 'browser-choices', 'browser-choice-controller',
    'browser-answer-watch', 'hh-web-ui')]
for name in names:
    assert subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root) == subprocess.check_output(
        ['git', 'show', f'{before}:{name}'], cwd=root)
bundle(root, [*changed_sources(root, parent), *evidence_logs(root, 'text-reply')],
       'docs/case-studies/issue-56/data/text-reply.tar.gz', {
           'parent': parent, 'reproduction_revision': before,
           'parent_production_modules_unchanged': names,
           'parent_failures': 2, 'intermediate_draft_failure': 1, 'node_checks': 28,
           'text_browser_cases': 36, 'compatibility_browser_cases': 56,
           'independent_mcp_cases': 5, 'live_provider': False,
           'remaining': 'Persistent acknowledgement/rejection attempts, inactive owner restoration, full unread orchestration, live provider checks, recurring macOS startup failure and every unchecked issue criterion.',
       }, 'issue-56-text-reply/*.png', before={name: parent for name in names})
