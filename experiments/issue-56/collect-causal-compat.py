"""Preserve exact hosted and focused causal-storage compatibility evidence."""
import hashlib
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'causal-compat')
assert 'fail 8' in read('parent')
assert 'fail 3' in read('targets-parent')
for name in ['focused-final', 'publications']:
    assert 'pass 12' in read(name) and 'fail 0' in read(name)
assert not read('lint-final').strip() and not read('secrets').strip()
assert 'All matched files use Prettier code style!' in read('format-final')
assert 'Changeset validation passed' in read('changeset')
sources = [name for name in changed_sources(root)
           if (root / name).is_file() and name != 'js/src/web/app.min.js']
sources += evidence_logs(root, 'causal-compat')
sources += [str(path.relative_to(root)) for path in
            logs.glob('reconciliation-parent-job-*.log')]
sources.append('ci-logs/reconciliation-parent-linux-node.log')
bundle(root, sources, 'docs/case-studies/issue-56/data/causal-compatibility.tar.gz',
       dict(parent='2fbdc4b2', hosted_parent='4bfeaf2c',
            parent_shared_failures=8, target_parent_failures=3,
            affected_name_passes=12, overlapping_publication_passes=12,
            full_local_matrix=False, exact_head_ci_required=True,
            windows_bun_startup_unresolved=True, issue_complete=False,
            app_bundle_sha256=hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest()),
       'no-causal-compat-images-*.png',
       before={name: '2fbdc4b2' for name in [
           'js/src/broadcast/targets.js', 'js/src/broadcast/service.js',
           'js/tests/automations-server.test.js', 'js/tests/background-jobs.test.js',
           'js/tests/cli.test.js', 'js/tests/e2e.test.js',
           'js/tests/server.test.js', 'js/tests/store-append.test.js']})
