"""Retain exact hosted failures and the focused rendered-consent correction."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'cv-publication-consent')
for name in ('before', 'after'):
    result = read(name)
    assert '"localSnapshotPushes":2' in result
    assert '"localPushes":1' in result
    assert '"recoveryReplayed":false' in result and 'OK (chromium)' in result
assert not read('lint-final').strip() and not read('diff').strip()
assert 'All matched files use Prettier code style!' in read('format-check')
jobs = [
    'question-templates-parent-browser-e2e-chromium-shard-1-4-132613956011.log',
    'continuation-head-browser-e2e-chromium-shard-1-4-132618517444.log',
]
for name in jobs:
    content = (logs / name).read_text()
    assert 'true !== false' in content and 'e2e-cv-publication-exports.mjs:53:12' in content
parent = json.loads((logs / 'cv-publication-consent-parent-checks.json').read_text())
assert parent['headSha'] == 'b3d4cf77ffe012ab7ae6e3b8de38799bbceaec41'
extra = [*jobs, 'question-templates-parent-checks.json',
         'question-templates-parent-checks-43649013601.log']
bundle(root, changed_sources(root) + evidence_logs(root, 'cv-publication-consent')
       + [f'ci-logs/{name}' for name in extra],
       'docs/case-studies/issue-56/data/cv-publication-consent.tar.gz',
       dict(parent='cbb1498f', local_parent_reproduces=False,
            hosted_failures=2, corrected_browser_scenarios=2,
            authenticated_provider_sessions=0, issue_complete=False),
       'issue-56-cv-publication-consent/*.png',
       before={'js/tests/helpers/e2e-cv-publication-exports.mjs': 'cbb1498f'})
