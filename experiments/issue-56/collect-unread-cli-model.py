"""Preserve saved CLI intent failures and bounded lifecycle regressions."""
from evidence_bundle import evidence_context, write_hashed_archive

root, logs, read = evidence_context(__file__, 'unread-cli-model')
assert 'fail 2' in read('before')
assert 'pass 5' in read('node') and 'fail 0' in read('node')
assert '5 pass' in read('bun') and '0 fail' in read('bun')
assert '5 passed | 0 failed' in read('deno')
assert 'pass 1' in read('existing') and 'fail 0' in read('existing')
assert not read('lint').strip()
names = [
    'js/src/cli/answer-model-commands.js',
    'js/src/cli/automation-commands.js',
    'js/tests/question-unread-cli-model.test.js',
    'experiments/issue-56/unread-model-fixture.mjs',
    'experiments/issue-56/unread-cli-model-before.py',
    'experiments/issue-56/collect-unread-cli-model.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/unread-cli-model.md',
]
names += [f'ci-logs/unread-cli-model-{name}.log' for name in
          ['before', 'node', 'bun', 'deno', 'existing', 'lint']]
write_hashed_archive(root, root / 'docs/case-studies/issue-56/data/unread-cli-model.tar.gz',
                     names, {'parent': '8250c313', 'checksPerRuntime': 5,
                             'existingTransportChecks': 1, 'liveProvider': False,
                             'hostedAccepted': False, 'remainingRows': 60}, 8)
