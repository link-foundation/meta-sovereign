"""Archive the bounded HeadHunter application chat reproduction and repair."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context

parent = 'a4e0946a0d5fb470636ae52dac62c89cfe0be2a8'
pinned = 'fa0991b8c2d0896fb3b4be6c69947f0590094b15'
prefix = 'application-chat-rejections'
root, logs, read = evidence_context(__file__, prefix)
checks = {
    'before': ["actual: [ '8' ]", "expected: [ '9', '8' ]"],
    'after': ['"staleRead":false', '"nativeVisitOrder":["9","8"]', '"chatSends":0'],
    'registered': ['verifyNativeApplicationChoiceHold', 'OK (chromium)'],
    'node': ['pass 66', 'fail 0'],
    'deno': ['66 passed | 0 failed'],
}
for name, fragments in checks.items():
    assert all(fragment in read(name) for fragment in fragments), name
assert json.loads(read('mcp-server').splitlines()[-1])['resourcesClosed']
mcp = json.loads((logs / f'{prefix}-mcp.json').read_text())
summary = json.loads(mcp['content'][0]['text'].split('### Result\n', 1)[1].split('\n###', 1)[0])
assert summary['errors'] == [] and not summary['liveProvider']
assert summary['initial']['rejections']['visits'] == ['9', '8']
assert summary['stopped']['chat']['sends'] == 0 and not summary['stopped']['child']['active']
evidence = [f'ci-logs/{prefix}-{name}.log' for name in [
    *checks, 'mcp-server', 'eslint', 'secretlint', 'format',
]]
evidence.append(f'ci-logs/{prefix}-mcp.json')
bundle(
    root, [*changed_sources(root, parent), *evidence],
    f'docs/case-studies/issue-56/data/{prefix}.tar.gz',
    {'published_parent': parent, 'reference': pinned, 'live_provider': False},
    f'issue-56-{prefix}/*.png',
    {path: parent for path in [
        'js/src/jobs/application-chats.js',
        'js/src/sources/browser-unread-conversations.js',
        'js/src/automation/question-unread-answers.js',
    ]},
)
