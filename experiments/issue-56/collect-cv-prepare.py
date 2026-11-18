"""Archive selected native About preparation and independent recovery evidence."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'cv-prepare')
assert 'pass 13' in read('node-final')
assert '13 passed | 0 failed' in read('deno-final')
assert 'pass 36' in read('compatibility-final')
assert 'pass 1' in read('ci-contracts')
assert not read('lint-final').strip()
assert 'All matched files use Prettier code style!' in read('static-final')
assert not read('secrets-final').strip()
assert 'ERROR' not in read('duplication')
assert read('before-results').count('expected actual-parent failure 1') == 2
assert '[e2e-cv-prepare] OK (webkit)' in read('webkit')
assert '"cases":8,"attached":8,"detached":8,"navigations":7,"nativeSaves":1,"errors":[]' in read('webkit')
assert json.loads(read('mcp').splitlines()[1]) == dict(
    cases=4, posts=2, providerReads=0, reviewWrites=0, attached=1, detached=1,
    prepared=1, nativeProviderReads=False, errors=[])
assert any('maximum execution time of 10m0s' in row['message']
           for row in json.loads((logs / 'cv-prepare-parent-deno-annotations.json').read_text()))
base = '9d805e4fdb1fded3d408eb97fbe4db4da32d5c87'
sources = changed_sources(root, base) + evidence_logs(root, 'cv-prepare')
sources += evidence_logs(root, 'hh-cv-editor-reference', ('.mjs',))
sources += ['ci-logs/hh-technology-reference-tree.json']
bundle(root, sources, 'docs/case-studies/issue-56/data/cv-prepare.tar.gz',
       dict(published_base=base, regression_parent=base, node_tests=13,
            deno_tests=13, compatibility_tests=36, ci_contracts=1,
            native_browser_cases=8, native_attachments=8, native_detachments=8,
            owner_saves=1, preparation_saves=0, mcp_cases=4,
            mcp_native_provider=False, expected_parent_failures=2,
            reference=dict(repository='konard/hh-job-application-automation',
                           commit='fa0991b8c2d0896fb3b4be6c69947f0590094b15'),
            unfinished='Shared-record identity, native workplace editing, copy/detach, durable batches, authenticated HH parity, bilingual provider writes, unreceived-intent cancellation, hosted exact-head CI and every unchecked issue criterion'),
       'issue-56-cv-prepare/**/*.png',
       before={name: base for name in ['js/src/jobs/service.js',
                                      'js/src/web/app.min.js']})
