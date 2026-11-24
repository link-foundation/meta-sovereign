"""Archive the finite backend inspection checks and exact parent sources."""
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, _, read = evidence_context(__file__, 'runner-backend')
parent = 'a79cfdb338662b1a7de40e007fa837f92ca9de0d'
parent_sources = [
    'js/src/server/runner-inspection.js',
    'js/src/transport/runner-health-receipt.js',
    'js/src/web/runner-view-state.js',
    'js/src/web/settings-runner.js',
]
checks = {
    'parent': ('fail 1', "state: 'missing'", 'undefined'),
    'node': ('pass 43', 'fail 0'),
    'deno': ('43 passed', '0 failed'),
    'native': ('"transport":"local"', '"checkoutAbsent":true'),
    'ssh': ('"transport":"SSH"', '"checkoutAbsent":true'),
    'browser-before': ('"before":true', '"backend":0', '"resourcesClosed":true'),
    'browser-after': ('"before":false', '"backend":1', '"resourcesClosed":true'),
    'mcp-server': ('"peerRunning":true', '"mutations":0', '"resourcesClosed":true'),
    'prettier': ('All matched files use Prettier code style!',),
}
for name, expected in checks.items():
    assert all(value in read(name) for value in expected), name
for name in ('lint', 'secrets', 'diff'):
    assert not read(name).strip(), name

sources = [name for name in changed_sources(root) if name != 'js/src/web/app.min.js']
logs = [name for name in evidence_logs(root, 'runner-backend')
        if not name.endswith('-node-draft.log')]
bundle(root, [*sources, *logs, 'ci-logs/runner-upstream-ssh-installer.js'],
       'docs/case-studies/issue-56/data/runner-backend-inspection.tar.gz',
       {'parent': parent, 'acceptance': 'VD01 remains open', 'focused_checks': 43,
        'parent_bundle': f'{parent}:js/src/web/app.min.js'},
       'issue-56-runner-backend/*.png',
       before={name: parent for name in parent_sources})
