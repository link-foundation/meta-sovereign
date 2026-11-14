"""Preserve the owned survey policy, actual-parent failures and browser evidence."""
import json
import re
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'application-feedback')
checks = {
    'before': ['fail 8', 'pass 1'],
    'before-native': ['Viewed-vacancy survey policy must be configurable'],
    'node-final': ['pass 41', 'fail 0'],
    'deno-final': ['9 passed | 0 failed'],
    'native-final': ['[e2e-application-feedback] OK (chromium)',
               '"mode":"automatic"', '"mode":"manual"', '"mode":"preview"',
               '"closed":true', '"recoveryReplay":false'],
    'format-check': ['All matched files use Prettier code style!'],
}
for name, fragments in checks.items():
    assert all(fragment in read(name) for fragment in fragments), name
for name in ['lint-final', 'secrets', 'diff']:
    assert not read(name).strip(), name
duplication = read('duplication')
assert 'Found' in duplication
total = next(line for line in duplication.splitlines() if 'Total:' in line)
percentages = re.findall(r'([\d.]+)%', total)
assert percentages and float(percentages[0]) <= 6.5, percentages
assert 'ERROR:' not in duplication, 'duplication threshold failed'
receipt = json.loads((logs / 'application-feedback-mcp-final.json').read_text())
assert not receipt.get('isError'), receipt
text = '\n'.join(row.get('text', '') for row in receipt['content'])
assert all(value in text for value in [
    '"selections":1', '"closes":1', '"challengeReads":0',
    '"entries":0', '"submissions":0', '"recoveryReplay":false', '"errors":[]'])
closed = json.loads((logs / 'application-feedback-mcp-closed.json').read_text())
assert closed['closed'] and closed['opens'] == 4 and closed['providerClicks'] == 0
sources = changed_sources(root) + evidence_logs(root, 'application-feedback') + [
    'experiments/issue-56/application_parent_fixture.py',
    'experiments/issue-56/application_native_probe.py',
    'experiments/issue-56/application-mcp-fixture.mjs',
    'experiments/issue-56/compose-application-mcp.py',
    'experiments/issue-56/application-native-fixture.mjs',
    'experiments/issue-56/vacancy-browser-fixture.mjs',
    'experiments/issue-56/vacancy-mcp-server.mjs',
    'js/tests/helpers/application-panel-browser.mjs',
    'js/tests/helpers/application-native-request.mjs',
    'ci-logs/application-feedback-parent-chromium-artifacts/summary.json',
]
parent = '8007a002e94eafaccc5f45c5de2b8073a264d6bf'
before = {name: parent for name in [
    'js/src/jobs/application-service.js', 'js/src/jobs/application-options.js',
    'js/src/jobs/application-batch-data.js', 'js/src/jobs/application-result.js',
    'js/src/cli/application-command.js', 'js/src/web/application-panel.js',
    'js/src/web/application-state.js',
]}
bundle(root, sources, 'docs/case-studies/issue-56/data/application-feedback.tar.gz',
       dict(parent=parent, focused_node=41, focused_deno=9,
            parent_service_failures=8, parent_native_missing_control=True,
            native_modes=['automatic', 'manual', 'preview'],
            mcp_selections=1, mcp_closes=1, challenge_reads=0,
            application_entries=0, application_submissions=0,
            recovery_replayed=False, locales=4, resources_closed=True,
            production_deadlines_changed=False,
            remaining_original_inventory_rows=81, issue_complete=False),
       'application-feedback-*.png', before=before)
