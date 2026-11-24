"""Preserve the exact parent, focused checks and owned browser observations."""
import json

from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs


root, _, read = evidence_context(__file__, 'template-prefix')
parent = '5978e619e28676a6a456818730be9bc59a84b6da'
matcher = 'js/src/automation/question-match.js'
checks = {
    'parent': ('fail 4', "actual: 'template'", 'shared provider plans'),
    'node': ('pass 88', 'fail 0'),
    'deno': ('88 passed', '0 failed'),
    'browser-before': ('"suffixRequestRequiresReview":false', '"nativeSends":0'),
    'browser-after': ('"suffixRequestRequiresReview":true', '"nativeSends":0'),
    'format-check': ('All matched files use Prettier code style!',),
}
for name, fragments in checks.items():
    assert all(fragment in read(name) for fragment in fragments), name
for name in ('lint', 'secrets', 'diff'):
    assert not read(name).strip(), name
for phase in ('before', 'after'):
    assert '"pageErrors":[]' in read(f'browser-{phase}')

mcp = json.loads(read('mcp').split('### Result\n', 1)[1])
assert mcp['draft'] == '' and mcp['sendDisabled'] and not mcp['overflow']
assert mcp['exceptions'] == [] and not mcp['liveProvider']
closed = json.loads(read('mcp-server').splitlines()[-1])
assert closed == {'resourcesClosed': True, 'liveProvider': False,
                  'stats': {'clicks': 0, 'textSends': 0, 'draft': ''}}
posts = [line for line in read('mcp-network').splitlines() if '[POST]' in line]
assert len(posts) == 2 and all('[200]' in line for line in posts)
assert '/answers/save' in posts[0] and '/browser/inspect' in posts[1]
images = 'issue-56-template-word-prefix/*.png'
assert len(list((root / 'docs/screenshots').glob(images))) == 5

sources = [name for name in changed_sources(root) if name != 'js/src/web/app.min.js']
logs = [name for name in evidence_logs(root, 'template-prefix')
        if not name.endswith(('-format-write.log', '-prepush-status.json'))]
bundle(root, [*sources, *logs],
       'docs/case-studies/issue-56/data/question-template-word-prefix.tar.gz',
       {'parent': parent, 'criterion': 'QA04', 'criterionComplete': False,
        'hostedChecksPending': True, 'nodeChecks': 88, 'denoChecks': 88,
        'nativeSends': 0, 'liveProvider': False, 'parent_bundle':
        f'{parent}:js/src/web/app.min.js'}, images, before={matcher: parent})
