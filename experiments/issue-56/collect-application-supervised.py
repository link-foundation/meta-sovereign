"""Preserve finite supervised-review evidence without replaying any provider action."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'application-supervised')
checks = {
    'compatibility-final': ['pass 184', 'fail 0'],
    'deno-final': ['14 passed | 0 failed'],
    'native-session-final': ['7 passed; 0 failed'],
    'native-clippy-final': ['finite checks verified'],
    'native-final': ['"scenario":"verifyApplicationPanel","phase":"passed"',
                     '"scenario":"supervised","phase":"passed"',
                     '"separateAnswers":true', '"separateLetter":true',
                     '"submissions":1', '"browsersClosed":true', 'OK (chromium)'],
    'before': ["actual: 'provider-confirmed'", "expected: 'none'"],
    'before-native': ["actual: 'provider-confirmed'", "expected: 'none'"],
    'format-final': ['All matched files'],
    'mcp-corrected-server': ['"closed":true', '"pageErrors":[]', '"liveProvider":false'],
}
for name, expected in checks.items():
    assert all(fragment in read(name) for fragment in expected), name
for name in ['lint-final', 'secrets-final', 'rust-format-final', 'diff-final']:
    assert not read(name).strip(), name
assert 'ERROR:' not in read('duplication-final')
mcp = json.loads((logs / 'application-supervised-mcp-final.json').read_text())
assert not mcp.get('isError')
receipt = '\n'.join(item.get('text', '') for item in mcp['content'])
assert all('"' + flag + '":true' in receipt for flag in [
    'separatelyConfirmedAnswers', 'separatelyConfirmedLetter', 'manualDelivery',
    'fourLocaleRecovery', 'browsersClosed'])
assert '"phoneOverflow":false' in receipt and '"pageErrors":[]' in receipt
parent = 'f523ccc585a97a6f270082fe94dee00660dd5073'
assert all(run['headSha'] == parent and run['conclusion'] == 'success' for run in
           json.loads((logs / 'application-supervised-parent-runs.json').read_text()))
metadata = dict(parent=parent, parent_ci='all five workflows pass',
                focused_node_tests=184, new_deno_tests=14, native_session_tests=7,
                native_chromium_scenarios=2, schema=14, checkpoint_representation=13,
                synthetic_provider=True, issue_complete=False, remaining_inventory_rows=81,
                remaining=['paced queue revisits and batches', 'independent confirmations',
                           'recruiter panels', 'every original unchecked criterion'])
bundle(root, changed_sources(root) + evidence_logs(root, 'application-supervised') +
       ['ci-logs/application-session-reference.txt'],
       'docs/case-studies/issue-56/data/application-supervised.tar.gz',
       metadata, 'application-supervised-*.png', before=dict.fromkeys([
           'js/src/jobs/application-actions.js', 'js/src/jobs/application-options.js',
           'js/src/cli/application-command.js', 'js/src/web/app.min.js'], parent))
