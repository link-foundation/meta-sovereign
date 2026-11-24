"""Preserve exact hosted capability failures without repeating full suites."""
from evidence_bundle import evidence_context, write_hashed_archive

root, logs, read = evidence_context(__file__, 'ci-translation-capability')
assert 'cvTranslation: true' in read('before') and 'fail 1' in read('before')
assert 'pass 1' in read('after') and 'fail 0' in read('after')
assert '1 passed | 0 failed' in read('deno')
names = [str(path.relative_to(root)) for path in sorted(logs.glob('d4c7fb81-job-*.log'))]
assert len(names) == 7
names += [str(path.relative_to(root)) for path in sorted(logs.glob('ci-translation-capability-*.log'))]
names += ['ci-logs/rtc-lifecycle-parent-checks.json',
          'js/tests/vacancy-search.test.js',
          'js/src/jobs/service.js',
          'experiments/issue-56/collect-translation-capability-ci.py']
write_hashed_archive(root,
    root / 'docs/case-studies/issue-56/data/ci-translation-capability.tar.gz',
    names, dict(parent='d4c7fb8122d3e708e584749a25a8ed5d63449bc0',
                run=43269083327, created_at='2026-11-12T17:24:23Z',
                failed_jobs=7, reproduced_capability_checks=1,
                full_local_suite=False,
                remaining_failure='Windows Deno rolling-cli startup downloads dependencies before the unchanged ten-second readiness deadline; investigation remains open',
                exact_new_head_ci_required=True), source_count=4)
