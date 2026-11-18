"""Preserve bounded idle-import evidence without attributing Windows causality."""
import json
import subprocess
from evidence_bundle import changed_sources, evidence_context, evidence_logs, verify_evidence, write_entries_archive

root, logs, read = evidence_context(__file__, 'route-loading')
parent = 'f09c8d2b0199e6693a9bfe22471e9b3ad81c5009'
verify_evidence(read, {
    'startup-before': ['AssertionError [ERR_ASSERTION]: started', 'fail 1'],
    'node-final': ['pass 5', 'fail 0'],
    'cv-compatibility': ['pass 3', 'fail 0'],
    'startup-profile': ['initial host ready after 3358 ms', 'import_started after 105 ms',
                        'import_finished after 1396 ms', '"code":0'],
}, empty=('lint-final', 'diff'))
before = json.loads((logs / 'route-loading-graph-before.json').read_text())
after = json.loads((logs / 'route-loading-graph-after.json').read_text())
assert (before['relativeStaticModules'], before['sourceBytes']) == (1159, 5768578)
assert (after['relativeStaticModules'], after['sourceBytes']) == (929, 4827584)
names = [*changed_sources(root), *[
    name for name in evidence_logs(root, 'route-loading')
    if '-draft' not in name and '-pr-before' not in name]]
entries = {name: (root / name).read_bytes() for name in names}
entries['before/js/src/server/index.js'] = subprocess.check_output([
    'git', 'show', f'{parent}:js/src/server/index.js'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'implementationParent': parent, 'newRegressionChecks': 2,
    'nodeFocusedPass': 5, 'cvCataloguePass': 3, 'realProductionCliScenarios': 1,
    'deferredRelativeStaticModules': 230, 'deferredSourceBytes': 940994,
    'windowsCauseEstablished': False, 'criterionAccepted': False,
    'originalUnchecked': 60, 'issueComplete': False,
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/deferred-provider-routes.tar.gz', entries)
