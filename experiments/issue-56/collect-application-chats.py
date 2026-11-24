"""Preserve the bounded real-child lifecycle and shared-control evidence."""
import json
from evidence_bundle import (evidence_context, changed_sources, evidence_logs,
                             verify_evidence, bundle, parent_reply_sources)

root, logs, read = evidence_context(__file__, 'application-chats')
assert 'fail 1' in read('before')
assert 'application-owned chat intent is missing' in read('before')
verify_evidence(read, {
    'node': ['pass 12', 'fail 0'],
    'bun': ['12 pass', '0 fail'],
    'deno': ['12 passed | 0 failed'],
    'ci-registration': ['pass 5', 'fail 0'],
    'check': ['All matched files use Prettier code style!'],
})
native = json.loads(read('native').splitlines()[-1])
assert native == {
    'cases': 1, 'actualChild': True, 'independentNativeBrowsers': True,
    'applicationDeliveries': 1, 'chatSends': 0, 'childDrained': True,
    'liveProvider': False,
}
inspection = json.loads((logs / 'application-chats-mcp-result.json').read_text())
result = next(item['text'] for item in inspection['content'] if item['type'] == 'text')
result = json.loads(result.split('### Result\n')[1].split('\n###')[0])
assert result['cases'] == 1 and result['errors'] == []
assert result['locales'] == ['ru', 'hi', 'zh', 'en']
assert result['initial']['child']['pid'] > 0
assert result['initial']['child']['held']['chat'] == '8'
assert result['initial']['chat'] == {
    'sends': 0, 'unreadNext': 1, 'draft': 'At 9 a.m.',
}
assert not result['stopped']['child']['active']
assert result['stopped']['chat']['sends'] == 0
assert json.loads(read('mcp-server').splitlines()[-1])['resourcesClosed']
sources = changed_sources(root) + evidence_logs(root, 'application-chats')
sources += ['experiments/issue-56/application-batch-fixture.mjs',
            'experiments/issue-56/application-native-fixture.mjs',
            'experiments/issue-56/chat-navigation-fixture.mjs',
            'experiments/issue-56/question-browser-probe.mjs',
            'ci-logs/application-chats-mcp-code.txt']
bundle(root, sources, 'docs/case-studies/issue-56/data/application-chats.tar.gz',
       {'parent': '933b23fb', 'focusedChecksPerRuntime': 12,
        'nativeCases': 1, 'mcpCases': 1, 'locales': 4, 'liveProvider': False,
        'consoleLimitations': ['favicon 404', 'browser cache-write failures'],
        'hostedAcceptance': 'pending', 'acceptedInventoryRows': [],
        'remainingRows': 60}, 'issue-56-application-chats/*.png',
       before=parent_reply_sources(root, sources, '933b23fb'))
