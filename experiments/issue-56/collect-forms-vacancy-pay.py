"""Verify and preserve the exact-parent and routed Forms pay evidence."""

import hashlib
import json

from evidence_bundle import changed_sources, evidence_context, write_hashed_archive


root, logs, read = evidence_context(__file__, 'forms-chat-pay')
assert '# pass 9' in read('parent-tests') and '# fail 4' in read('parent-tests')
assert '# pass 53' in read('node') and '# fail 0' in read('node')
assert '53 passed | 0 failed' in read('deno')
assert '"source":"owner-target","minimum":2679' in read('browser-before')

browser = next(line for line in read('browser-after').splitlines()
               if line.startswith('[forms-vacancy-pay] '))
browser = json.loads(browser.split(' ', 1)[1])
assert browser['receipts'] == 1 and browser['submits'] == 0
assert browser['refused'] == 'form-answers-changed'
assert '476.19' in browser['values']['hourly']
assert browser['values']['monthly'] == browser['values']['technical'] == ''
assert browser['values']['ownerPay'] == 'Owner keeps this pay answer'

mcp = json.loads((logs / 'forms-chat-pay-mcp.json').read_text())
receipt = json.loads(mcp['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert receipt == {
    'opened': 200, 'read': 200, 'planned': 200, 'applied': 200, 'closed': 200,
    'receipts': 1, 'fits': True, 'errors': [], 'source': 'vacancy-pay',
}
server = json.loads(read('mcp-server').splitlines()[-1])
assert server['reads'] == [{'slot': 'vacancy-pay-review', 'closed': True,
                            'events': ['input'], 'values': browser['values']}]
assert server['vacancyReads'] == browser['reads'] == [{
    'useCase': 'forms', 'slot': 'form-vacancy', 'closed': True,
    'urls': ['https://hh.ru/vacancy/12345678901234567890'], 'methods': ['GET'],
}]
assert not server['sourceReads'] and server['submissions'] == 0
assert '0 over the 1500 line limit' in read('limits')
for name in ('lint', 'diff'):
    assert not read(name).strip(), name

files = [file for file in changed_sources(root) if file != 'js/src/web/app.min.js']
evidence = [f'ci-logs/forms-chat-pay-{name}' for name in [
    'parent-tests.log', 'node.log', 'deno.log', 'browser-before.log', 'browser-after.log',
    'mcp.json', 'mcp-console.json', 'mcp-server.log', 'mcp.png', 'lint.log',
    'limits.log', 'build.log', 'format-check.log', 'diff.log',
]]
write_hashed_archive(
    root,
    root / 'docs/case-studies/issue-56/data/forms-vacancy-pay.tar.gz',
    files + evidence,
    {
        'parent': 'e90c2d02ca881108bd56aa07074626c8c6a5cbde',
        'reference': 'fa0991b8c2d0896fb3b4be6c69947f0590094b15',
        'production_web_sha256': hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest(),
        'live_provider': False,
        'hosted_verification': 'Open',
    },
    len(files),
)
