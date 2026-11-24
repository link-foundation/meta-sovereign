"""Archive bounded private translation comparisons and independent UI evidence."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context

root, logs, read = evidence_context(__file__, 'cv-translation')
assert 'pass 23' in read('node')
assert '19 passed | 0 failed' in read('deno')
assert not read('lint').strip()
assert 'All matched files use Prettier code style!' in read('static')
assert not read('secrets').strip()
assert 'ERROR' not in read('duplication')
assert read('parent').count('expected actual-parent failure 1') == 2
assert '[e2e-cv-translation] OK (webkit)' in read('browser')
assert '"cases":6,"modelCalls":11,"drained":1,"providerSessions":0,"errors":[]' in read('browser')
independent = json.loads(read('mcp').split('### Result\n')[1].splitlines()[0])
assert independent == dict(cases=5, modelCalls=11, drained=1, resolved=13,
                          authenticatedProvider=False, liveTranslator=False,
                          posts=1, geometry=dict(width=350, scroll=350), errors=[])
base = '2389fc8e2e3c8ae72277d0becc720dd56c6b06f5'
sources = [name for name in changed_sources(root)
           if name != 'js/src/web/app.min.js']
for name in ('node', 'deno', 'lint', 'static', 'secrets', 'duplication', 'parent',
             'service-before', 'browser-before', 'browser', 'mcp',
             'mcp-investigation', 'mcp-loader'):
    sources.append(f'ci-logs/cv-translation-{name}.log')
bundle(root, sources, 'docs/case-studies/issue-56/data/cv-translation.tar.gz',
       dict(regression_parent=base, node_tests=23, deno_tests=19,
            expected_parent_failures=2, native_browser_cases=6,
            native_model_fixture_calls=11, native_drained_calls=1,
            independent_browser=independent, live_models=False,
            authenticated_provider=False,
            unfinished='Full HH/LinkedIn export, field matching and reviewed synchronization; latest installed translator verification; live translation quality and Formal AI failure publication; every other unchecked issue criterion'),
       'issue-56-cv-translation/**/*.png',
       before={'js/src/jobs/service.js': base})
