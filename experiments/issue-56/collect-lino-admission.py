"""Preserve finite text-log admission regressions and focused compatibility."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'lino-admission')
assert 'All 15 finite log-order/input regressions fail' in read('parent-replay')
assert 'fail 15' in read('parent')
assert 'pass 52' in read('node-final') and 'fail 0' in read('node-final')
assert 'pass 13' in read('failure-compat') and 'fail 0' in read('failure-compat')
assert not read('lint').strip()
assert not read('secrets').strip()
assert 'All matched files use Prettier code style!' in read('format')
assert 'Changeset validation passed' in read('changeset')
assert '[e2e-lino-sync] OK (webkit)' in read('browser')
ci = json.loads((logs / 'lino-admission-parent-ci.json').read_text())
assert ci['headSha'].startswith('e8ff3c84')
sources = [name for name in changed_sources(root) if (root / name).is_file()
           and name != 'js/src/web/app.min.js']
sources += evidence_logs(root, 'lino-admission')
sources += ['ci-logs/sync-receive-merged-network.log']
bundle(root, sources, 'docs/case-studies/issue-56/data/lino-mutation-admission.tar.gz',
       dict(published_base='e8ff3c84', new_regressions=15, parent_failures=15,
            focused_checks=65, full_local_suite=False, stress_test=False,
            exact_head_ci_required=True, offline_reconciliation_verified=False),
       'issue-56-lino-admission/**/*.png', before={name: 'e8ff3c84' for name in [
           'js/src/storage/lino-store.js', 'js/src/storage/mutation.js',
           'js/src/storage/universal.js']})
