"""Preserve finite exact-record preparation regressions and native evidence."""
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'cv-workplace-prepare')
assert 'pass 46' in read('node')
assert '46 passed | 0 failed' in read('deno')
assert read('before-run').count('expected actual-parent failure 1') == 3
assert 'A reviewed workplace description must expose native preparation' in read('browser-before')
assert '[e2e-cv-workplace-prepare] OK (webkit)' in read('browser')
assert '"cases":5,"attached":9,"detached":9,"reads":7,"navigations":9,"saves":0,"errors":[]' in read('browser')
assert '[e2e-cv-prepare] OK (webkit)' in read('browser-compat')
assert '[e2e-cv-save-watch] OK (webkit)' in read('save-compat')
assert 'pass 21' in read('node-compat')
assert '21 passed | 0 failed' in read('deno-compat')
assert 'pass 6' in read('node-final')
assert '6 passed | 0 failed' in read('deno-final')
assert not read('lint').strip()
assert 'All matched files use Prettier code style!' in read('static')
assert not read('secrets').strip()
assert 'ERROR' not in read('duplication')
base = 'ee7a74e466c49498ee47ece193a30e55559a65ec'
bundle(root, changed_sources(root) + evidence_logs(root, 'cv-workplace-prepare') + [
    'ci-logs/cv-workplace-prepare-reference.mjs'],
    'docs/case-studies/issue-56/data/cv-workplace-prepare.tar.gz',
    dict(published_base=base, node=46, deno=46, new_checks=6,
         compatibility_node=21, compatibility_deno=21, native_cases=5,
         attached=9, detached=9, native_reads=7, provider_saves=0,
         mcp_available=False, authenticated_provider=False,
         unfinished='Full fields/add/copy/detach, new identities, batches, bilingual provider saves, authenticated parity, exact-head CI and all unchecked criteria'),
    'issue-56-cv-workplace-prepare/**/*.png',
    before={name: base for name in [
        'js/src/jobs/cv-prepare-record.js',
        'js/src/jobs/cv-prepare-source.js',
        'js/src/web/app.min.js']})
