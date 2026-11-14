"""Preserve reviewed target-only selection and exact-parent refusal evidence."""
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'cv-workplace-membership')
assert 'pass 39' in read('final-node') and 'fail 0' in read('final-node')
assert '20 passed | 0 failed' in read('final-deno')
assert 'pass 17' in read('validation-last') and 'fail 0' in read('validation-last')
assert read('parent-replay').count('expected actual-parent failure 1') == 2
assert '[e2e-cv-workplace-membership] OK (webkit)' in read('browser-last')
assert '"cases":6,"attached":12,"detached":12,"reads":9,"navigations":9,"saves":0' in read('browser-last')
assert '[e2e-cv-prepare] OK (webkit)' in read('native-compat')
assert '0 errors, 6 warnings' in read('lint-final')
assert not read('secrets-final').strip()
assert 'All matched files use Prettier code style!' in read('format-final')
assert 'Found 1 changeset file(s)' in (logs / 'cv-membership-changeset-after.log').read_text()
base = '3483c8b1f623a8220bdb8adaa83de372da2b8c7d'
bundle(root, changed_sources(root) + evidence_logs(root, 'cv-workplace-membership') + [
    'ci-logs/cv-area-clear-editor-reference.mjs',
    'ci-logs/cv-membership-changeset-before.log',
    'ci-logs/cv-membership-changeset-after.log'],
    'docs/case-studies/issue-56/data/cv-workplace-membership.tar.gz',
    dict(published_base=base, new_focused_checks=8,
         focused_node_checks=39, focused_deno_checks=20,
         native_cases=6, native_compatibility_cases=27,
         attached=12, detached=12, native_reads=9, provider_saves=0,
         mcp_available=False, authenticated_provider=False,
         parent_checks_run=43266303454, parent_failure_job=131351156787,
         release_correction='e2968a55: retain one existing minor changeset',
         unfinished='Shared copy/new record identities, durable batches, complete bilingual/provider writes, live model and provider parity, exact-head CI and every unchecked criterion'),
    'issue-56-cv-workplace-membership/**/*.png',
    before={name: base for name in ['js/src/jobs/cv-workplace-review-service.js',
        'js/src/web/app.min.js']})
