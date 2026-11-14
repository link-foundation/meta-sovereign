"""Retain exact-record readback regressions and finite native browser evidence."""
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'cv-workplace-identity')
assert 'pass 30' in read('node')
assert '30 passed | 0 failed' in read('deno')
assert 'fail 2' in read('before')
assert 'The exact record must be confirmed' in read('browser-before')
assert '[e2e-cv-workplace-identity] OK (webkit)' in read('browser')
assert '"recordReads":16,"recordNavigations":4,"ownerSaves":4,"inertScriptsExecuted":false,"errors":[]' in read('browser')
assert '[e2e-cv-save-watch] OK (webkit)' in read('browser-compat')
assert not read('lint').strip()
assert 'All matched files use Prettier code style!' in read('static')
assert not read('secrets').strip()
assert 'ERROR' not in read('duplication')
base = 'd76215a10034df559103f3d5e2604158eba174a1'
sources = changed_sources(root) + evidence_logs(root, 'cv-workplace-identity')
bundle(root, sources, 'docs/case-studies/issue-56/data/cv-workplace-identity.tar.gz',
       dict(published_base=base, node=30, deno=30, native_cases=4,
            inert_malformed_documents=6, record_reads=16, owner_saves=4,
            inert_scripts_executed=False, mcp_available=False,
            authenticated_provider=False,
            unfinished='Exact published-head CI, native workplace preparation/copy/detach, durable batches, new identities, bilingual provider saves and all unchecked criteria'),
       'issue-56-cv-workplace-identity/**/*.png',
       before={name: base for name in [
           'js/src/jobs/cv-watch-verification.js',
           'js/src/jobs/cv-watch-document.js',
           'js/src/jobs/cv-watch-export.js']})
