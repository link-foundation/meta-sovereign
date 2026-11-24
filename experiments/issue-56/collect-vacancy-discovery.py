"""Preserve bounded discovery sources, parent failures and owned browser evidence."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'vacancy-discovery')
checks = {
    'before': ['fail 12', 'is not a function'],
    'before-native': ['Finite automatic discovery must be available'],
    'node-final': ['pass 47', 'fail 0'],
    'deno': ['21 passed | 0 failed'],
    'native': ['[e2e-vacancy-discovery] OK (chromium)', '"providerClicks":0'],
    'format': ['All matched files use Prettier code style!'],
    'duplication': ['6.49%', 'Found'],
}
for name, fragments in checks.items():
    assert all(fragment in read(name) for fragment in fragments), name
for name in ['lint-final', 'secrets', 'diff']:
    assert not read(name).strip(), name
receipt = json.loads((logs / 'vacancy-discovery-mcp-final.json').read_text())
assert not receipt.get('isError'), receipt
text = '\n'.join(row.get('text', '') for row in receipt['content'])
assert all(value in text for value in ['"vacancies":3', '"resourcesClosed":true', '"errors":[]'])
closed = json.loads((logs / 'vacancy-discovery-mcp-closed.json').read_text())
assert closed['closed'] and closed['opens'] == 4 and closed['providerClicks'] == 0
sources = changed_sources(root) + evidence_logs(root, 'vacancy-discovery') + [
    'experiments/issue-56/application_parent_fixture.py',
    'experiments/issue-56/application-mcp-fixture.mjs',
    'experiments/issue-56/compose-application-mcp.py',
    'experiments/issue-56/vacancy-browser-fixture.mjs',
    'experiments/issue-56/vacancy-mcp-server.mjs',
    'js/tests/helpers/refused-snapshot.mjs',
    'ci-logs/batch-cli-admission-parent-job-132554838330.log',
]
parent = '7998d2c5b63e7bd9f00fc7946ab50c6b99687f1c'
before = {name: parent for name in [
    'js/src/jobs/service.js', 'js/src/web/vacancies-panel.js',
    'js/src/web/application-batch-state.js', 'js/src/jobs/search-result.js',
    'js/src/cli/command-names.js',
]}
bundle(root, sources, 'docs/case-studies/issue-56/data/vacancy-discovery.tar.gz',
       dict(parent=parent, focused_node=47, focused_deno=21,
            native_pages=2, native_cards=3, native_descriptions=2,
            provider_clicks=0, recovery_replayed=False, batch_started=False,
            locales=4, resources_closed=True, production_deadlines_changed=False,
            remaining_original_inventory_rows=81, issue_complete=False),
       'vacancy-discovery-*.png', before=before)
