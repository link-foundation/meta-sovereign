"""Archive integrated focused checks and exact hosted capability failures."""
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'mesh-membership')
assert 'pass 26' in read('node') and 'fail 0' in read('node')
assert 'pass 14' in read('refactor-node')
assert 'pass 9' in read('refactor-fields')
assert '[e2e-cv-workplace-membership] OK (webkit)' in read('refactor-browser-fixed')
assert '"cases":6' in read('refactor-browser-fixed')
assert not read('all-lint-fixed').strip()
assert 'Changeset validation passed' in read('changeset')
assert 'fail 1' in (logs / 'vacancy-capabilities-before.log').read_text()
assert 'pass 1' in (logs / 'vacancy-capabilities-after.log').read_text()
base = 'd4c7fb8122d3e708e584749a25a8ed5d63449bc0'
sources = [name for name in changed_sources(root, base)
           if name != 'js/src/web/app.min.js' and (root / name).is_file()]
sources += evidence_logs(root, 'mesh-membership')
sources += evidence_logs(root, 'vacancy-capabilities')
sources += ['ci-logs/checks-43269083327-bun-linux.log',
            'ci-logs/checks-43269083327-bun-macos.log',
            'ci-logs/refactor-cv-workplace-membership-desktop.png',
            'ci-logs/refactor-cv-workplace-membership-phone.png']
bundle(root, sources,
       'docs/case-studies/issue-56/data/mesh-membership-integration.tar.gz',
       dict(published_base=base, hosted_run=43269083327,
            hosted_jobs=[131362601330, 131362601552],
            combined_checks=26, workplace_checks=23, capability_checks=1,
            native_webkit_cases=6, zero_lint_warnings=True,
            full_local_suite=False, exact_head_ci_required=True),
       'issue-56-mesh-membership-integration/**/*.png',
       before={'js/tests/vacancy-search.test.js': base})
