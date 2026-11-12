"""Archive ID-specific native About cancellation and recovery evidence."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'cv-prepare-cancel')
assert 'pass 22' in read('node-final')
assert '22 passed | 0 failed' in read('deno-final')
assert 'pass 1' in read('ci-contracts')
assert not read('lint-final').strip()
assert 'All matched files use Prettier code style!' in read('static-final')
assert not read('secrets-final').strip()
assert read('before-results').count('expected actual-parent failure 1') == 2
native = read('webkit-final')
assert '[e2e-cv-prepare] OK (webkit)' in native
assert '"cases":8,"attached":8,"detached":8,"navigations":7,"nativeSaves":1,"errors":[]' in native
assert '"cases":4,"preparationPosts":1,"cancellations":1,"attached":1,"detached":1,"navigations":1,"saves":0,"nativeCancels":0,"errors":[]' in native
assert '[e2e-cv-prepare-cancel] OK (webkit)' in read('webkit-screenshots')
assert json.loads(read('mcp-final').splitlines()[1]) == dict(
    cases=5, preparationPosts=2, cancellationPosts=2, providerReads=0,
    reviewWrites=0, attached=1, detached=1, prepared=1,
    nativeProviderReads=False, errors=[])
parent = json.loads((logs / 'cv-prepare-cancel-parent-checks.json').read_text())
base = '6e5f3ca7a102ed326ff4c186fba4a85f6a2ee9fc'
assert parent['headSha'] == base
windows = [job for job in parent['jobs'] if job['name'].startswith('Test (deno on windows-2025, shard')]
assert len(windows) == 3 and all(job['conclusion'] == 'success' for job in windows)
sources = changed_sources(root, base) + evidence_logs(root, 'cv-prepare-cancel')
sources += ['experiments/issue-56/cv-prepare-mcp-server.mjs']
bundle(root, sources, 'docs/case-studies/issue-56/data/cv-prepare-cancel.tar.gz',
       dict(published_base=base, regression_parent=base, node_tests=22,
            deno_tests=22, new_tests=9, existing_tests=13, ci_contracts=1,
            native_browser_cases=12, new_native_cases=4, mcp_cases=5,
            cancellation_attachments=0, cancellation_saves=0,
            cancellation_native_cancels=0, replacement_attachments=1,
            replacement_detachments=1, mcp_native_provider=False,
            expected_parent_failures=2, parent_windows_deno_shards=3,
            unfinished='Shared-workplace identity, native workplace editing, copy/detach, durable batches, bilingual provider writes, authenticated HH parity, complete exact-head CI and every unchecked issue criterion'),
       'issue-56-cv-prepare-cancel/**/*.png',
       before={name: base for name in ['js/src/jobs/cv-prepare-service.js',
                                      'js/src/web/app.min.js']})
