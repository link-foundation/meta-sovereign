"""Preserve the exact hosted scenario-registration failure and finite correction."""
from evidence_bundle import bundle, evidence_context

root, logs, read = evidence_context(__file__, 'application-feedback-shard')
assert 'combines 5 native scenarios' in read('before')
assert 'pass 5' in read('node') and 'fail 0' in read('node')
assert not read('lint').strip()
sources = [
    'js/tests/ci-browser-shards.test.js',
    'js/tests/e2e-job-application-policies-browser.mjs',
    'js/tests/e2e-job-application-feedback-browser.mjs',
    'js/scripts/browser-checks.json',
    'experiments/issue-56/collect-application-feedback-shard.py',
    'docs/case-studies/issue-56/ci-application-feedback-shard.md',
] + [f'ci-logs/application-feedback-shard-{name}.log'
     for name in ['before', 'node', 'lint', 'format']]
sources += [f'ci-logs/application-configuration-parent-{name}' for name in [
    'workflow.log', 'contracts.log', 'jobs.json']]
bundle(root, sources, 'docs/case-studies/issue-56/data/application-feedback-shard.tar.gz',
       dict(parent='21b7afcbaa3a574ed2df02576f7c6da0dec57932',
            workflow=43640819417, job=132588015295, focused_node=5,
            production_deadlines_changed=False, issue_complete=False,
            remaining_original_inventory_rows=81), 'application-feedback-shard-*.png',
       before={name: '21b7afcb' for name in [
           'js/scripts/browser-checks.json', 'js/tests/ci-browser-shards.test.js',
           'js/tests/e2e-job-application-policies-browser.mjs', 'package.json']})
