"""Preserve confirmed restoration consent without claiming provider parity."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'application-limit-restore')
checks = {
    'focused-final': ('pass 52', 'fail 0'),
    'deno-final': ('47 passed | 0 failed',),
    'shared-final': ('pass 50', 'fail 0'),
    'before': ('Confirmed expiry restoration is missing.',),
    'before-native': ('Confirmed expiry restoration is missing.',),
    'native': ('"guardedRefreshes":1', '"restorationConfirmedWithWait":true',
               '"sends":0', '"errors":[]', 'OK (chromium)'),
    'compatibility-native': ('"restorationSeparatelyConfirmed":true', '"sends":0',
                             'OK (chromium)'),
    'mcp-server': ('"closed":true', '"liveProvider":false', '"pageErrors":[]'),
    'format-final': ('All matched files use Prettier code style!',),
}
for name, fragments in checks.items():
    assert all(fragment in read(name) for fragment in fragments), name
for name in ('lint-final', 'secrets-final', 'diff-final'):
    assert not read(name).strip(), name
assert 'ERROR:' not in read('duplication-final')
result = json.loads((logs / 'application-limit-restore-mcp-result.json').read_text())
receipt = json.loads(result['content'][0]['text'].split('### Result\n', 1)[1].split('\n', 1)[0])
assert receipt['resourcesClosed'] and receipt['restorationConfirmedWithWait']
assert receipt['sends'] == 0 and receipt['guardedRefreshes'] == 1 and not receipt['errors']
parent = 'e2bc1bd91057e3ee4507e09f86251da756dbb8eb'
sources = changed_sources(root) + evidence_logs(root, 'application-limit-restore')
sources += ['experiments/issue-56/application_parent_fixture.py',
            'ci-logs/checks-43591479049-webkit-4.log',
            'ci-logs/checks-43594980663-webkit-4.log',
            'ci-logs/checks-43594980663-download.log',
            'ci-logs/resume-input-checks-current.json',
            'ci-logs/resume-input-runs-current.json']
bundle(root, sources, 'docs/case-studies/issue-56/data/application-limit-restore.tar.gz', {
    'published_parent': parent, 'native_schema': 19,
    'node_final_group': 52, 'deno_final_group': 47, 'shared_node_group': 50,
    'native_chromium_restoration': 1, 'existing_limits_scenarios': 2,
    'independent_mcp': 1, 'entry_clicks': 1, 'sends': 0,
    'guarded_expiry_refreshes': 1, 'restoration_requires_explicit_consent': True,
    'authenticated_provider': False, 'original_inventory_unchecked': 81,
    'issue_complete': False, 'exact_head_ci_required': True,
    'unresolved_original_ci': {'run': 43591479049, 'job': 132437782294},
    'cancelled_parent_ci': {'run': 43594980663, 'job': 132448452075,
                            'resume_group': 'passed', 'full_log': 'partial'},
}, 'application-limit-restore-*.png', before={
    name: parent for name in ('js/src/jobs/application-limit-wait.js',
                            'js/src/web/application-limit-view.js')
})
