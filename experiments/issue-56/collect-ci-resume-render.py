"""Preserve the exact hosted rendered-state failure and focused correction."""
from evidence_bundle import bundle, evidence_context

root, logs, read = evidence_context(__file__, 'ci-resume-render')
assert '[e2e-job-resumes] OK (webkit)' in read('native')
assert '"cases":6' in read('native') and '"pageErrors":[]' in read('native')
assert not read('lint').strip()
assert 'All matched files use Prettier code style!' in read('prettier')
failed = (logs / 'browser-tabs-hosted-webkit4.log').read_text()
assert 'e2e-job-resumes.mjs:22:14' in failed and 'false !== true' in failed
bundle(root, [
    'experiments/issue-56/collect-ci-resume-render.py',
    'docs/case-studies/issue-56/ci-resume-render.md',
    'js/tests/helpers/e2e-job-resumes.mjs',
    'ci-logs/browser-tabs-hosted-webkit4.log',
    'ci-logs/browser-tabs-hosted-run.json',
    *[f'ci-logs/ci-resume-render-{name}.log'
      for name in ['native', 'lint', 'prettier']],
], 'docs/case-studies/issue-56/data/ci-resume-render.tar.gz',
   dict(parent='80e93aa5e5bcd73b6e50ad244f92550c1eb5835d',
        hosted_job=132170643020, local_browser='webkit', scenarios=6,
        production_change=False, deadlines_changed=False,
        exact_head_ci_required=True, issue_complete=False),
   'no-resume-render-images-*',
   before={'js/tests/helpers/e2e-job-resumes.mjs': '80e93aa5'})
