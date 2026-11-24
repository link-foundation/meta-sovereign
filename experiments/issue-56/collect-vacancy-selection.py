"""Preserve selection review, real rejected cache puts and bounded browser proof."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'vacancy-selection')
assert 'fail 1' in read('before-node')
assert 'Search selection reasons must be available' in read('before-ui')
assert 'fail 2' in read('cache-before-node')
assert 'A rejected collection must retain only acknowledged descriptions' in read('cache-before-node')
assert 'pass 37' in read('focused-final') and 'fail 0' in read('focused-final')
assert 'pass 4' in read('registry') and 'fail 0' in read('registry')
assert '[e2e-vacancy-selection] OK (webkit)' in read('browser-final')
assert '"failedSearchPreserved":true' in read('browser-final')
stats = json.loads((logs / 'vacancy-selection-mcp-final-stats.json').read_text())
assert stats == dict(opens=3, closed=True, providerClicks=0, pageErrors=[],
                     liveProvider=False)
recorded = json.loads((logs / 'vacancy-selection-mcp-final-result.json').read_text())
assert any('"nativeReasons":true' in entry.get('text', '')
           for entry in recorded['content'])
result = json.loads((logs / 'vacancy-selection-mcp-result.json').read_text())
assert result == dict(nativeReasons=True, staleChoice=True,
                      persistentSettings=True, reversibleFilters=True,
                      providerClicks=0, pageErrors=[])
for name in ['lint', 'secrets', 'diff', 'collector-secrets']:
    assert not read(name).strip(), name
assert 'All matched files use Prettier code style!' in read('prettier')
assert '0 over the 1500 line limit' in read('line-limits')
assert 'ERROR' not in read('duplication-final')
sources = [name for name in changed_sources(root)
           if name != 'js/src/web/app.min.js']
sources += [
    'experiments/issue-56/vacancy-browser-fixture.mjs',
    'experiments/issue-56/vacancy-mcp-server.mjs',
    'experiments/issue-56/parent_source_probe.py',
    'js/src/jobs/acknowledged-store.js',
    'js/src/storage/browser-store.js',
]
bundle(root, [*sources, *evidence_logs(root, 'vacancy-selection')],
       'docs/case-studies/issue-56/data/vacancy-selection.tar.gz',
       dict(parent='222f2e80ecf6ac485382cc01f70b96a84476862a',
            focused=37, browser_registry=4, actual_parent_failures=3,
            actual_parent_ui_missing=True, native_scenarios=1, mcp=stats,
            first_webkit_timeout_explained=False, deadlines_increased=False,
            issue_complete=False, exact_head_ci_required=True),
       'issue-56-vacancy-selection/*.png',
       before={name: '222f2e80' for name in [
           'js/src/assignments/vacancy.js', 'js/src/jobs/service.js',
           'js/src/jobs/technology-storage.js',
           'js/src/web/vacancies-panel.js', 'js/src/web/vacancy-api.js',
       ]})
