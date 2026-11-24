"""Preserve failed hosted sync, exact-parent replay and real recovery checks."""
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'lino-sync-readiness')
assert 'pass 3' in read('node') and 'fail 0' in read('node')
assert '3 passed | 0 failed' in read('deno')
assert 'Expected actual-parent discovery/reload failure' in read('parent-replay')
assert 'rediscovery' in read('parent-webkit4')
assert '[e2e-lino-sync] OK (webkit)' in read('final-native')
assert '"interrupted":true,"reloaded":true' in read('final-native')
assert '[e2e-lino-sync-spa-readiness] OK (webkit)' in read('spa')
assert not read('final-lint').strip()
assert not read('final-secrets').strip()
assert 'All matched files use Prettier code style!' in read('final-format')
base = '2fb595e15ad72ff69af7d8abae43208d56957050'
bundle(root, changed_sources(root) + evidence_logs(root, 'lino-sync-readiness'),
       'docs/case-studies/issue-56/data/ci-lino-sync-readiness.tar.gz',
       dict(published_base=base, failed_parent='2389fc8e',
            failed_run=43254148533, failed_job=131312063036,
            failed_timestamp='2026-11-12T16:27:29Z',
            actual_parent_reproduced=True, focused_checks_per_runtime=3,
            native_webkit_scenarios=2, forced_discovery_reload=True,
            existing_convergence_deadline_ms=20000,
            full_local_suite=False, mcp_available=False,
            exact_new_head_ci_required=True,
            unfinished='All unchecked original issue feature requirements'),
       'issue-56-ci-lino-sync-readiness/**/*.png',
       before={name: base for name in [
           'js/tests/e2e-lino-sync.mjs', 'js/tests/e2e-browser-spa.mjs']})
