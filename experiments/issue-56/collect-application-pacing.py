"""Retain acknowledged review pacing evidence without claiming batch parity."""
import json
import subprocess
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'application-pacing')
for name, fragments in {
    'before': ('did not save its admission interval', 'fail 1'),
    'before-native': ('optional pacing control is absent',),
    'node-final': ('pass 44', 'fail 0'),
    'deno-final': ('19 passed | 0 failed',),
    'migration-registry': ('pass 4', 'fail 0'),
    'native-final': ('"nativeDeliveries":1', '"automaticSends":0',
                     '"workerPauseRetained":true', '[e2e-job-application] OK'),
    'format-final': ('All matched files use Prettier code style!',),
}.items():
    assert all(fragment in read(name) for fragment in fragments), name
for name in ('lint-final', 'secrets-final', 'diff-final'):
    assert not read(name).strip(), name
assert 'Found ' in read('duplication-final') and 'ERROR:' not in read('duplication-final')
mcp = json.loads((logs / 'application-pacing-mcp-result.json').read_text())
assert mcp['fixedSeconds'] == 17 and mcp['locales'] == 4 and mcp['phone']
assert mcp['closed'] and not mcp['expiryOpened'] and not mcp['liveProvider']
assert mcp['providerClicks'] == 0 and mcp['errors'] == mcp['pageErrors'] == []
parent = '0aa608516804400f38c215f12f626f92e8f63f3e'
sources = changed_sources(root) + evidence_logs(root, 'application-pacing') + [
    'experiments/issue-56/application_parent_fixture.py',
    'experiments/issue-56/application-mcp-fixture.mjs',
    'experiments/issue-56/compose-application-mcp.py',
    'ci-logs/checks-43611833853.log',
    'ci-logs/checks-43611833853-download.log',
    'ci-logs/checks-43611833853-findings.log',
]
before = {name: parent for name in sources if name.startswith('js/src/') and
          subprocess.run(['git', 'cat-file', '-e', f'{parent}:{name}'], cwd=root,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0}
bundle(root, sources, 'docs/case-studies/issue-56/data/application-pacing.tar.gz',
       dict(published_parent=parent, schema=20, node_passed=44,
            migration_registry_passed=4, deno_passed=19,
            native_manual_deliveries=1, automatic_sends=0, mcp=mcp,
            live_authenticated_account=False, single_review_admission=True,
            full_paced_batches=False, automatic_ram_queue_revisits=False,
            original_incomplete_rows=81, issue_complete=False,
            exact_head_ci_required=True), 'application-pacing-*.png', before=before)
