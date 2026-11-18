"""Preserve exact-parent fresh-document failures and finite recovery checks."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'application-recovery')
assert 'pass 33' in read('focused-final') and 'fail 0' in read('focused-final')
assert 'pass 10' in read('registration-final') and 'fail 0' in read('registration-final')
assert 'fail 1' in read('before')
assert "'ready' !== 'review'" in read('before-native')
assert '"recoveredEntry":0,"recoveredSubmission":1' in read('native')
assert '[e2e-job-application] OK (chromium)' in read('native')
for name, flags in [('before-mcp-result', ['parentReadyBlocked']),
                    ('mcp-final', ['recoveredForm', 'entryBlocked',
                        'confirmationRequired', 'readOnlyReload',
                        'originalLetterVerified', 'confirmedDelivery'])]:
    result = json.loads((logs / f'application-recovery-{name}.json').read_text())
    assert not result.get('isError'), name
    text = '\n'.join(item.get('text', '') for item in result['content'])
    for flag in flags:
        assert f'"{flag}":true' in text, flag
for name in ['before-mcp-resources', 'mcp-final-resources']:
    resources = json.loads((logs / f'application-recovery-{name}.json').read_text())
    assert resources['closed'] and resources['pageErrors'] == []
for name in ['lint-final', 'secrets-final', 'diff-final']:
    assert not read(name).strip(), name
assert 'All matched files' in read('format-final')
assert '6.47%' in read('duplication-final')
assert json.loads((root / '.jscpd.json').read_text())['threshold'] == 6.5
sources = ['js/src/jobs/application-service.js', 'js/src/jobs/application-review.js',
           'js/src/jobs/application-journal.js']
bundle(root, [*changed_sources(root), *evidence_logs(root, 'application-recovery')],
       'docs/case-studies/issue-56/data/application-recovery.tar.gz',
       dict(parent='e1c1010459e386fbb1263045e695fa12e6e2b805',
            focused=33, registry_checks=4, recovered_entries=0,
            explicit_submissions=1, resources_closed=True,
            authenticated_provider=False, issue_complete=False,
            exact_head_ci_required=True,
            unfinished=['popup and owner-draft recovery', 'deferred retry queues',
                        'complete session policies', 'original unchecked inventory']),
       'application-recover*.png', before={name: 'e1c10104' for name in sources})
