"""Preserve bounded bilingual CV review, actual-parent and browser evidence."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'cv-technology')
assert 'pass 20' in read('node-final')
assert '20 passed | 0 failed' in read('deno-final')
assert 'pass 60' in read('compatibility-final')
assert '1 passed | 0 failed' in read('deno-ci-contracts')
assert not read('lint-final').strip()
assert 'All matched files use Prettier code style!' in read('static-final')
assert 'ERROR' not in read('duplication')
assert read('parent-replay').count('expected actual-parent failure 1') == 2
assert '"result":{"cases":4,"providerReads":0,"exports":2}' in read('webkit-final')
mcp = json.loads((logs / 'cv-technology-mcp-result.json').read_text())
result = mcp['content'][0]['text'].split('### Result\n', 1)[1].split('\n###', 1)[0]
assert json.loads(result) == dict(cases=4, generationPosts=2, savePosts=1, pageErrors=[])
assert json.loads((logs / 'cv-technology-mcp-counts.json').read_text()) == dict(
    providerReads=0, reviewWrites=3, nativeProviderReads=False)
base = '8c4bfc6c468e5578c5a248ee8f0c4e0cedcb0707'
sources = changed_sources(root, base) + evidence_logs(root, 'cv-technology')
sources += evidence_logs(root, 'hh-technology-reference', ('.mjs', '.json', '.lino'))
sources += evidence_logs(root, 'technology-permissions')
sources += [str(path.relative_to(root)) for path in sorted(
    (logs / 'cv-technology-base-webkit2-artifacts').rglob('*')) if path.is_file()]
bundle(root, sources, 'docs/case-studies/issue-56/data/cv-technologies.tar.gz',
       dict(published_base=base, regression_parent=base, node_tests=20, deno_tests=20,
            compatibility_tests=60, deno_ci_contracts=1, expected_parent_failures=2,
            native_browser_cases=4, mcp_cases=4, provider_reads=0,
            hosted=dict(commit=base, run=43177885613,
                        created='2026-11-12T07:47:40Z', failed_job=131048574094),
            unfinished='Provider CV editing/save/readback, complete HH19/HH20, hosted keyboard/disclosure investigations, exact new-head CI and every unchecked issue criterion'),
       'issue-56-cv-technologies/**/*.png',
       before={name: base for name in ['js/src/jobs/technology-service.js',
                                      'js/src/web/app.min.js']})
