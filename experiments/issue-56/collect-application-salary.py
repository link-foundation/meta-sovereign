"""Preserve application admission evidence without accepting wider HH parity."""
import json

from evidence_bundle import (
    evidence_context, changed_sources, evidence_logs, verify_evidence,
    bundle, parent_reply_sources,
)

root, logs, read = evidence_context(__file__, 'salary-application')
verify_evidence(read, {
    'focused': ['pass 50', 'fail 0'],
    'before': ['pass 1', 'fail 13'],
    'native': ['[e2e-application-salary] OK (chromium)', '"sends":0',
               '"directFormRecovered":true', '"ownedResourcesClosed":true'],
    'mcp-before': ['"phase":"before"', '"entryHeld":false'],
    'mcp-after': ['"phase":"after"', '"entryHeld":true', '"locales":4'],
    'mcp-server': ['"resourcesClosed":true'],
    'mcp-after-server': ['"resourcesClosed":true'],
    'format-check': ['All matched files use Prettier code style!'],
}, empty=('lint', 'secrets', 'diff', 'browser-entry'))
for phase in ('before', 'after'):
    stats = json.loads((logs / f'salary-application-mcp-{phase}-stats.json').read_text())
    assert stats['closed'] and stats['clicks'] == 0 and stats['errors'] == []
    assert stats['outcomes'] and all(row['entries'] == row['attempts'] == 0
                                    for row in stats['outcomes'])
sources = changed_sources(root)
sources += evidence_logs(root, 'salary-application')
sources += ['ci-logs/application-salary-parent.min.js']
bundle(root, sources,
    'docs/case-studies/issue-56/data/application-salary-admission.tar.gz',
    dict(acceptance=False, parent='4fefd254', focusedTests=50,
         parentPass=1, parentFail=13, sends=0, ownerFieldsRestored=2,
         nativeLetterDisclosureClicks=1, mcpProviderClicks=0, locales=4,
         unfinishedCriteria=40, exactSourceHostedVerificationRequired=True),
    'issue-56-application-salary-*.png',
    before=parent_reply_sources(root, sources, '4fefd254'))
