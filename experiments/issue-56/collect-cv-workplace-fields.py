"""Preserve exact-source workplace review, native controls and recovery evidence."""
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'cv-workplace-fields')
assert 'pass 9' in read('final-node') and 'fail 0' in read('final-node')
assert '9 passed | 0 failed' in read('final-deno')
assert 'pass 61' in read('compat-node')
assert '61 passed | 0 failed' in read('compat-deno')
assert read('parent-replay').count('expected actual-parent failure 1') == 3
assert 'All workplace fields need an explicit review and native draft preparation flow' in read('browser-before')
assert 'TypeError' in read('receipt-before')
assert '[e2e-cv-workplace-fields] OK (webkit)' in read('native')
assert '"cases":4,"attached":7,"detached":7,"reads":5,"navigations":8,"saves":0,"errors":[]' in read('native')
assert '[e2e-cv-prepare] OK (webkit)' in read('native-compat')
assert not read('final-lint').strip()
assert not read('final-secrets').strip()
assert 'All matched files use Prettier code style!' in read('final-format')
assert 'ERROR' not in read('duplication')
assert 'rediscovery' in read('parent-webkit4')
base = '2389fc8e2e3c8ae72277d0becc720dd56c6b06f5'
bundle(root, changed_sources(root) + evidence_logs(root, 'cv-workplace-fields') + [
    f'ci-logs/cv-workplace-fields-{name}.mjs'
    for name in ['reference', 'areas-reference', 'industries-reference']],
    'docs/case-studies/issue-56/data/cv-workplace-fields.tar.gz',
    dict(published_base=base, focused_checks_per_runtime=9,
         earlier_compatibility_checks_per_runtime=61, native_cases=4,
         native_compatibility_cases=21, attached=7, detached=7,
         native_reads=5, provider_saves=0, mcp_available=False,
         authenticated_provider=False, parent_checks_run=43254148533,
         parent_failure='WebKit shard 4: API read during offline rediscovery reload',
         unfinished='Area clearing, shared add/copy/detach, new records/identities, batches, authenticated parity, exact-head CI and all unchecked criteria'),
    'issue-56-cv-workplace-fields/**/*.png',
    before={name: base for name in ['js/src/jobs/technology-service.js',
        'js/src/jobs/cv-prepare-record.js', 'js/src/web/app.min.js']})
