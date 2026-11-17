"""Retain exact hosted and focused evidence for the unread context assertion."""
import evidence_bundle as evidence
import re

root, logs, read = evidence.evidence_context(__file__, 'ci-unread-model-direction')
assert 'fail 1' in read('before') and 'outgoing: true' in read('before')
evidence.verify_evidence(read, {
    'node': ['pass 11', 'fail 0', 'skipped 0'],
    'deno': ['11 passed', '0 failed'],
    'format': ['All matched files use Prettier code style!'],
}, empty=('lint', 'secrets', 'diff'))
for name in ['0041-deno-linux-2.log', '0041-bun-linux.log']:
    text = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', (logs / name).read_text())
    assert 'question-unread-model.test.js:38:12' in text and 'outgoing: true' in text
evidence.bundle(root, [*evidence.changed_sources(root),
                      *evidence.evidence_logs(root, 'ci-unread-model-direction'),
                      'ci-logs/0041-deno-linux-2.log', 'ci-logs/0041-bun-linux.log',
                      'ci-logs/0041-current-jobs.json'],
                'docs/case-studies/issue-56/data/ci-unread-model-direction.tar.gz',
                dict(acceptance=False, failedSource='0041b2a8859ccf157f36fe82c9b52d0aeed285df',
                     focusedTestsPerRuntime=11, productionChanged=False,
                     pending='Fresh hosted verification and all 40 original criteria'),
                'unused-unread-model-direction',
                before={'js/tests/question-unread-model.test.js': '0041b2a8'})
