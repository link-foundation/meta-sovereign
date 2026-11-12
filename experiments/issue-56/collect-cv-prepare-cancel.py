"""Preserve unreceived-intent cancellation regressions and native UI evidence."""
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'cv-prepare-cancel')
assert 'pass 22' in read('node')
assert '22 passed | 0 failed' in read('deno')
assert 'pass 36' in read('compatibility')
assert 'fail 1' in read('before')
assert 'An unknown intent needs explicit cancellation' in read('browser-before')
assert '[e2e-cv-prepare] OK (webkit)' in read('browser-compat')
assert '[e2e-cv-prepare-cancel] OK (webkit)' in read('browser')
assert '"lateState":"cancelled","attached":1,"detached":1,"navigations":1,"saves":0,"errors":[]' in read('browser')
assert not read('lint').strip()
assert 'All matched files use Prettier code style!' in read('static')
assert not read('secrets').strip()
assert 'ERROR' not in read('duplication')
base = '9c188c96c4d4f2e6f3e3c48ba23701355eb908bb'
sources = changed_sources(root) + evidence_logs(root, 'cv-prepare-cancel')
bundle(root, sources, 'docs/case-studies/issue-56/data/cv-prepare-cancel.tar.gz',
       dict(published_base=base, node=22, deno=22, compatibility=36,
            native_cases=9, cancelled_late_attachments=0,
            fresh_attachments=1, fresh_detachments=1, preparation_saves=0,
            mcp_available=False, authenticated_provider=False,
            unfinished='Exact new-head CI, shared identity, workplace editing/copy/detach, durable batches, bilingual provider save/readback and every unchecked issue criterion'),
       'issue-56-cv-prepare-cancel/**/*.png',
       before={name: base for name in ['js/src/jobs/cv-prepare-service.js',
                                      'js/src/web/app.min.js']})
