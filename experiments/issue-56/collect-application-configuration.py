"""Retain isolated policy resolution, parent regressions and unfinished research."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs, verify_evidence

root, logs, read = evidence_context(__file__, 'application-configuration')
verify_evidence(read, {
    'before': ['pass 2', 'fail 2'],
    'node': ['pass 13', 'fail 0'],
    'deno': ['4 passed | 0 failed'],
    'format-check': ['All matched files use Prettier code style!'],
})
dependency = json.loads((logs / 'application-configuration-production-dependency.json').read_text())
assert dependency['dependencies']['lino-arguments']['version'] == '0.4.1'
package = json.loads((root / 'package.json').read_text())
assert package['dependencies']['lino-arguments'] == '0.4.1'
assert 'lino-arguments' not in package['devDependencies']
packed = json.loads((logs / 'application-configuration-pack.json').read_text())[0]
assert any(row['path'] == 'js/src/cli/application-configuration.js' for row in packed['files'])
research = json.loads((logs / 'application-configuration-viewed-research.json').read_text())
assert research['cards'] == research['visited_capable_titles'] == 20
assert not research['native_viewed_state_verified']
sources = changed_sources(root) + evidence_logs(root, 'application-configuration') + [
    'experiments/issue-56/application_parent_fixture.py',
    'experiments/issue-56/application-fixture.mjs',
    'experiments/issue-56/application-batch-fixture.mjs',
    'node_modules/lino-arguments/README.md',
    'node_modules/lino-arguments/package.json',
    'ci-logs/application-reference-head.json',
    'ci-logs/vacancy-viewed-reference.mjs',
    'ci-logs/vacancy-viewed-config-reference.mjs',
    'ci-logs/vacancy-viewed-native-search.html',
]
bundle(root, sources, 'docs/case-studies/issue-56/data/application-configuration.tar.gz',
       dict(parent='21b7afcbaa3a574ed2df02576f7c6da0dec57932', focused_node=13,
            focused_deno=4, parent_failures=2, production_dependency='lino-arguments@0.4.1',
            frozen_single_batch=True, status_replayed=False, provider_submissions=0,
            host_environment_mutated=False, native_viewed_state_verified=False,
            remaining_original_inventory_rows=81, issue_complete=False),
       'application-configuration-*.png',
       before={'js/src/cli/application-command.js': '21b7afcb'})
