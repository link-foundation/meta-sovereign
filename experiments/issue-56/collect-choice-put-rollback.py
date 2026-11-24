"""Preserve actual-parent failed puts and acknowledged readback verification."""
import json
from evidence_bundle import bundle, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'choice-put-rollback')
assert 'fail 4' in read('before-node') and 'pass 0' in read('before-node')
assert 'Reload must retain the last acknowledged choice' in read('before-ui')
assert 'pass 29' in read('focused') and 'fail 0' in read('focused')
assert '[e2e-choice-put-rollback] OK (webkit)' in read('browser')
assert '"reloadPreserved":true' in read('browser')
assert 'pass 4' in read('registry') and 'fail 0' in read('registry')
stats = json.loads((logs / 'choice-put-rollback-mcp-stats.json').read_text())
assert stats == dict(opens=1, closed=True, providerClicks=0, pageErrors=[],
                     liveProvider=False, failedSaves=1)
for check in ['lint', 'secrets', 'diff', 'collector-secrets']:
    assert not read(check).strip(), check
assert '0 over the 1500 line limit' in read('line-limits')
assert 'All matched files use Prettier code style!' in read('prettier')
assert 'ERROR' not in read('duplication')
sources = [
    '.changeset/visible-browser-defaults.md',
    'docs/case-studies/issue-56/choice-put-rollback.md',
    'experiments/issue-56/collect-choice-put-rollback.py',
    'experiments/issue-56/choice-put-fixture.mjs',
    'experiments/issue-56/choice-put-rollback-before.py',
    'experiments/issue-56/choice-put-rollback-browser.mjs',
    'experiments/issue-56/choice-put-rollback-mcp.mjs',
    'experiments/issue-56/vacancy-browser-fixture.mjs',
    'experiments/issue-56/vacancy-mcp-server.mjs',
    'js/src/jobs/technology-storage.js', 'js/src/jobs/technology-catalog.js',
    'js/src/jobs/acknowledged-store.js', 'js/src/storage/browser-store.js',
    'js/tests/job-choice-durability.test.js',
    'js/tests/helpers/e2e-choice-put-rollback.mjs',
    'js/tests/e2e-vacancy-choices-browser.mjs',
    *[str(path.relative_to(root)) for path in
      (root / 'docs/screenshots/issue-56-choice-put-rollback').glob('*.png')],
]
bundle(root, [*sources, *evidence_logs(root, 'choice-put-rollback')],
       'docs/case-studies/issue-56/data/choice-put-rollback.tar.gz',
       dict(parent='262280fc7d3d13f480cdfaf4b17935760a96747f',
            focused=29, actual_parent_failures=4, native_scenarios=1,
            browser_registry=4, mcp=stats, issue_complete=False,
            deadlines_increased=False, exact_head_ci_required=True),
       'issue-56-choice-put-rollback/*.png',
       before={f'js/src/jobs/technology-{name}.js': '262280fc'
               for name in ['storage', 'catalog']})
