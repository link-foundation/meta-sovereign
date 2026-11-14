"""Archive verified popup recovery without turning synthetic checks into parity."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'application-popup')
required_fragments = {
    'compatibility-final': ('pass 200', 'fail 0'),
    'consolidated-node': ('pass 18', 'fail 0'),
    'deno-final': ('18 passed | 0 failed',),
    'before': ('undefined', 'fail 1'),
    'before-native': ('acknowledged popup must offer separately confirmed re-entry',),
    'native-fixed-fixture': ('"phase":"passed"', '"automaticEntry":0',
                             '"submissions":1', '"browsersClosed":true', 'OK (chromium)'),
    'native-session-final': ('7 passed; 0 failed',),
    'native-clippy-final': ('finite checks verified',),
    'format-final': ('All matched files',),
}
for label, fragments in required_fragments.items():
    missing = [fragment for fragment in fragments if fragment not in read(label)]
    assert not missing, (label, missing)
assert not any(read(label).strip() for label in (
    'lint-final', 'secrets-final', 'rust-format-final', 'diff-final'))
assert 'ERROR:' not in read('duplication-final')
assert json.loads((root / '.jscpd.json').read_text())['threshold'] == 6.5
for label in ('mcp', 'supervised-mcp', 'draft-mcp'):
    response = json.loads((logs / f'application-popup-{label}-final.json').read_text())
    assert response.get('isError') is not True, label
    report = '\n'.join(item.get('text', '') for item in response['content'])
    assert '"pageErrors":[]' in report, label
    resource_log = read(label + '-server')
    assert all(value in resource_log for value in (
        '"closed":true', '"pageErrors":[]', '"liveProvider":false')), label

original = '103c8c249f93b6d4968b60decb1a937dd38e511c'
observed = json.loads((logs / 'application-popup-parent-runs.json').read_text())
assert all(run['headSha'] == original for run in observed)
capture = changed_sources(root) + evidence_logs(root, 'application-popup')
capture.extend(['ci-logs/application-session-reference.txt',
                'ci-logs/application-popup-reference-drafts.mjs',
                'ci-logs/application-popup-reference-resume.mjs'])
bundle(root, capture, 'docs/case-studies/issue-56/data/application-popup.tar.gz', {
    'parent': original, 'parent_workflows': observed,
    'node_compatibility': 200, 'new_node_and_deno': 18, 'native_session': 7,
    'native_chromium': 1, 'independent_mcp_scenarios': 3,
    'schema': 15, 'durable_representation': 13,
    'original_inventory_unchecked': 81, 'issue_complete': False,
    'live_authenticated_provider': False, 'exact_head_ci_still_required': True,
    'unfinished': ['complete HH06 and reference runner parity',
                   'all original unchecked acceptance criteria'],
}, 'application-popup-*.png', before={
    'js/src/jobs/application-actions.js': original,
    'js/src/jobs/application-journal.js': original,
    'js/src/web/application-panel.js': original,
})
