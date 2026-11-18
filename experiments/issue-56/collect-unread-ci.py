"""Retain actual failed jobs and bounded parent/corrected unread regressions."""
from evidence_bundle import evidence_context, write_hashed_archive

root, logs, read = evidence_context(__file__, 'unread-ci')
assert 'fail 2' in read('before')
assert 'pass 31' in read('node') and 'fail 0' in read('node')
assert '31 pass' in read('bun') and '0 fail' in read('bun')
assert '31 passed | 0 failed' in read('deno')
assert 'owner-answer-releases-held-chat' in read('native-fixed')
names = [
    'js/src/automation/question-browser-unread.js',
    'js/src/automation/question-unread-answers.js',
    'js/tests/question-unread-model.test.js',
    'js/tests/question-unread-answers.test.js',
    'js/tests/question-browser-unread.test.js',
    'js/tests/helpers/e2e-unread-answers.mjs',
    'experiments/issue-56/unread-polling-fixture.mjs',
    'experiments/issue-56/unread-ci-before.py',
    'experiments/issue-56/collect-unread-ci.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/unread-ci-regressions.md',
]
names += [f'ci-logs/unread-ci-{suffix}' for suffix in [
    'before.log', 'node.log', 'bun.log', 'deno.log', 'native-debug.log',
    'native-fixed.log', 'latest-runs.json', 'latest-jobs.json']]
names += [str(path.relative_to(root)) for path in sorted(
    logs.glob('checks-43819156751-*.log'))]
write_hashed_archive(root, root / 'docs/case-studies/issue-56/data/unread-ci.tar.gz',
                     names, {'parent': '5427c11e', 'checksPerRuntime': 31,
                             'hostedAccepted': False, 'remainingRows': 60}, 9)
