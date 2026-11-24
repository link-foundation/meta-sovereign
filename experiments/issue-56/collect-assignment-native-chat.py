"""Verify and package the routed HeadHunter vacancy capture evidence."""

import hashlib
import json

from evidence_bundle import (
    changed_sources, evidence_context, evidence_logs, write_hashed_archive,
)


root, logs, read = evidence_context(__file__, 'hh-native-assignment')
vacancy = 'https://hh.ru/vacancy/12345678901234567890'
assert '# fail 2' in read('unit-replay')
assert '# pass 56' in read('node') and '# fail 0' in read('node')
assert '56 passed | 0 failed' in read('deno')
assert '"cases":5' in read('browser') and '"result":1' in read('browser')
assert '"source":"unknown","reads":[],"response":200' in read('forms-parent')
assert f'"source":"chat","reads":["{vacancy}"],"response":200' in read('forms')
report = json.loads(read('mcp-server').splitlines()[-1])
assert report['forms'] == [{'value': '', 'closed': True}]
assert report['vacancyReads'] == [vacancy] and report['modelCalls'] == 1
assert report['nativeCapture']['counters'] == {'value': '', 'clicks': 0, 'sends': 0}
assert report['nativeCapture']['errors'] == []
assert not report['externalWrites'] and report['submissions'] == 0
mcp = json.loads((logs / 'hh-native-assignment-mcp.json').read_text())
result = json.loads(mcp['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert result == {
    'opened': 200, 'read': 200, 'planned': 200, 'draft': 200,
    'reviewed': 'Vacancy used: Python engineer', 'override': '', 'fits': True,
    'errors': [], 'writes': [],
}
assert '0 over the 1500 line limit' in read('limits')
for check in ('lint', 'secrets', 'diff'):
    assert not read(check).strip(), check

mobile = 'docs/screenshots/issue-56-assignment-native-chat-vacancy-after-mobile.png'
mobile_hash = hashlib.sha256((root / mobile).read_bytes()).hexdigest()
assert mobile_hash == hashlib.sha256((logs / 'hh-native-assignment-mcp.png').read_bytes()).hexdigest()
files = changed_sources(root) + [
    'ci-logs/assignment-chat-vacancy-donor-requirements.txt',
    'experiments/issue-56/evidence_bundle.py',
]
write_hashed_archive(
    root,
    root / 'docs/case-studies/issue-56/data/assignment-native-chat-vacancy.tar.gz',
    files + evidence_logs(root, 'hh-native-assignment'),
    {
        'parent': 'cd0c7b25223e58a406e9c9c43896cee64a570b68',
        'reference': 'fa0991b8c2d0896fb3b4be6c69947f0590094b15',
        'MCP screenshot': {'same_as': mobile, 'sha256': mobile_hash},
        'live_provider': False,
        'hosted_verification': 'Open',
    },
    len(files),
)
