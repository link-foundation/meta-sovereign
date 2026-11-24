"""Keep bounded discovery evidence without accepting wider HH application parity."""
from evidence_bundle import (
    evidence_context, changed_sources, evidence_logs, verify_evidence,
    bundle, parent_reply_sources,
)

root, logs, read = evidence_context(__file__, 'salary-ladder')
verify_evidence(read, {
    'focused': ['pass 29', 'fail 0'],
    'before': ['pass 1', 'fail 4'],
    'ui-before': ['Matching-search salary tiers must be configurable'],
    'native': ['[e2e-salary-ladder] OK (chromium)', '"providerClicks":0'],
    'mcp': ['"opens":5', '"clicks":0', '"errors":[]'],
    'mcp-server': ['"resourcesClosed":true'],
    'format-check': ['All matched files use Prettier code style!'],
}, empty=('lint', 'secrets', 'diff'))
sources = changed_sources(root)
sources += evidence_logs(root, 'salary-ladder')
sources += ['ci-logs/salary-ladder-mcp-console.log']
bundle(root, sources,
    'docs/case-studies/issue-56/data/salary-ladder-discovery.tar.gz',
    dict(acceptance=False, parent='51047939', focusedTests=29,
         providerClicks=0, nativeReaders=5, replayed=False,
         unfinished=['full application admission', 'direct forms', 'retries'],
         exactSourceHostedVerificationRequired=True),
    'issue-56-salary-ladder-*.png',
    before=parent_reply_sources(root, sources, '51047939'))
