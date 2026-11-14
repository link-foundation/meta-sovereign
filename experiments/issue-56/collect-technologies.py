"""Preserve bounded cached-analysis regressions, browser evidence and CI logs."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'technology')
assert 'pass 21' in read('node-final')
assert '21 passed | 0 failed' in read('deno-final')
assert 'pass 72' in read('compatibility')
assert '3 passed | 0 failed' in read('deno-ci-contracts')
assert not read('lint-final').strip()
assert 'All matched files use Prettier code style!' in read('static-final')
assert 'ERROR' not in read('duplication')
assert read('parent-replay').count('expected actual-parent failure 1') == 3
assert '"result":{"cases":4,"providerReads":0,"cachedVacancies":2}' in read('webkit-final')
mcp = json.loads((logs / 'technology-mcp-result.json').read_text())
result = mcp['content'][0]['text'].split('### Result\n', 1)[1].split('\n###', 1)[0]
assert json.loads(result) == dict(cases=4, analysisPosts=1, cachedVacancies=2, pageErrors=[])
assert json.loads((logs / 'technology-mcp-counts.json').read_text()) == dict(
    providerReads=0, analyses=1, nativeProviderReads=False)
base = '0f6692c9dcc126495aa1973930ef7185e0a30c4c'
parent = '72ec50bfaa76542366d9c4d0adf97e8164d3773f'
sources = changed_sources(root, base)
sources += evidence_logs(root, 'technology')
sources += evidence_logs(root, 'hh-technology-reference', ('.mjs', '.json', '.lino'))
bundle(root, sources,
       'docs/case-studies/issue-56/data/technology-analysis.tar.gz',
       dict(published_base=base, regression_parent=parent,
            node_tests=21, deno_tests=21, compatibility_tests=72,
            deno_ci_contracts=3, expected_parent_failures=3,
            native_browser_cases=4, mcp_cases=4, provider_reads=0,
            hosted=dict(commit=parent, run=43172233986,
                        created='2026-11-12T07:01:37Z',
                        aggregate_timeout_job=131029957383,
                        timeout_log_lines=[1754, 1763]),
            unfinished='Exact-head CI, HH19/HH20 bilingual editing/review, authenticated live parity and every unchecked issue criterion'),
       'issue-56-technologies/**/*.png',
       before={name: parent for name in [
           'js/src/jobs/service.js', 'js/src/web/app.min.js',
           'js/scripts/browser-checks.json']})
