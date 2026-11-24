"""Retain finite late-native guard evidence and the unchanged browser budgets."""
import subprocess
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'application-pacing-guard')
for name, fragments in {
    'before': ('fail 2', '0 !== 1'),
    'before-native': ('0 !== 1', 'verifyNativeApplicationPacingGuard'),
    'node-final': ('pass 40', 'fail 0'),
    'deno-final': ('35 passed | 0 failed',),
    'native-final': ('"nativeDeliveries":1', '"automaticSends":0',
                     '"lateNativeOutcomes":2', '"sends":0',
                     '[e2e-job-application-pacing] OK'),
    'format-final': ('All matched files use Prettier code style!',),
}.items():
    assert all(fragment in read(name) for fragment in fragments), name
for name in ('lint-final', 'secrets-final', 'diff-final'):
    assert not read(name).strip(), name
assert 'Found ' in read('duplication-final') and 'ERROR:' not in read('duplication-final')
parent = subprocess.check_output(['git', 'rev-parse', '9a78b6d9'], cwd=root, text=True).strip()
sources = changed_sources(root) + evidence_logs(root, 'application-pacing-guard') + [
    'experiments/issue-56/application_parent_fixture.py',
    'experiments/issue-56/check-application-pacing.py',
    'experiments/issue-56/application-pacing-fixture.mjs',
    'experiments/issue-56/application-native-fixture.mjs',
    'js/tests/helpers/e2e-application-pacing.mjs',
    '.github/workflows/release.yml',
]
before = {name: parent for name in sources if name.startswith(('js/', 'package.json')) and
          subprocess.run(['git', 'cat-file', '-e', f'{parent}:{name}'], cwd=root,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0}
bundle(root, sources, 'docs/case-studies/issue-56/data/application-pacing-guard.tar.gz',
       dict(parent=parent, node_passed=40, deno_passed=35, native_scenarios=2,
            late_native_outcomes=2, late_guard_sends=0, automatic_sends=0,
            original_scenarios_preserved=True, group_deadline_ms=180000,
            browser_job_minutes=35, original_incomplete_rows=81,
            issue_complete=False, exact_head_ci_required=True),
       'application-pacing-*.png', before=before)
