"""Preserve the adapter replay, focused checks and disposable browser receipts."""
import hashlib
import json

from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs


root, _, read = evidence_context(__file__, 'whatsapp-links')
parent = 'a57f60cdd5d9284716b78f33226ebe0e54af1852'
app = 'js/src/web/app.min.js'
checks = {
    'parent': ('fail 9', 'WhatsApp nested video captions', 'both Lino formats'),
    'node': ('pass 114', 'fail 0'),
    'deno': ('97 passed (27 steps)', '0 failed'),
    'browser-before': ('"requiresReview":false', '"hiddenTargetVisible":false'),
    'browser-after': ('"requiresReview":true', '"hiddenTargetVisible":true'),
    'format-check': ('All matched files use Prettier code style!',),
}
for name, fragments in checks.items():
    assert all(fragment in read(name) for fragment in fragments), name
for name in ('lint', 'secrets', 'diff'):
    assert not read(name).strip(), name
for phase in ('before', 'after'):
    log = read(f'browser-{phase}')
    assert '"sends":0' in log and '"pageErrors":[]' in log

mcp = json.loads(read('mcp').split('### Result\n', 1)[1])
assert [item['locale'] for item in mcp['results']] == ['en', 'ru', 'hi', 'zh']
assert all(item['literalDestination'] and item['translatedLabel'] for item in mcp['results'])
assert not any(mcp[key] for key in ('errors', 'followed', 'reloadReplayed', 'liveProvider'))
posts = [line for line in read('mcp-network').splitlines() if '[POST]' in line]
assert len(posts) == 4 and all('/api/automations/plan => [200]' in line for line in posts)
assert json.loads(read('mcp-server').splitlines()[-1]) == {
    'sends': 0, 'liveProvider': False, 'resourcesClosed': True,
}

images = 'issue-56-question-whatsapp-links/*.png'
assert len(list((root / 'docs/screenshots').glob(images))) == 5
sources = [name for name in changed_sources(root) if name != app]
logs = [name for name in evidence_logs(root, 'whatsapp-links')
        if not name.endswith(('-format-write.log', '-format-docs.log', '-node-draft.log'))]
bundle(root, [*sources, *logs],
       'docs/case-studies/issue-56/data/question-whatsapp-links.tar.gz',
       {'parent': parent, 'criterion': 'QA04', 'criterionComplete': False,
        'nodeChecks': 114, 'denoTests': 97, 'denoSteps': 27, 'browserSends': 0,
        'liveProvider': False, 'parentBundle': f'{parent}:{app}',
        'bundleSha256': hashlib.sha256((root / app).read_bytes()).hexdigest()},
       images, before={name: parent for name in (
           'js/src/sources/message-text-links.js', 'js/src/sources/whatsapp.js')})
