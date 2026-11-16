"""Preserve the actual CodeQL finding and finite generated-code regression."""
from evidence_bundle import evidence_context, write_hashed_archive

root, logs, read = evidence_context(__file__, 'application-chats-codeql')
assert 'fail 1' in read('before')
assert 'pass 3' in read('node') and 'fail 0' in read('node')
assert not read('lint').strip()
assert 'All matched files use Prettier code style!' in read('check')
names = [
    'experiments/issue-56/application-chats-mcp.mjs',
    'experiments/issue-56/mcp-inspection-code.mjs',
    'js/tests/mcp-inspection-code.test.js',
    'experiments/issue-56/application-chats-codeql-before.py',
    'experiments/issue-56/collect-application-chats-codeql.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/application-chats-codeql.md',
    'ci-logs/security-43825987290.log',
]
names += [f'ci-logs/application-chats-codeql-{name}.log' for name in
          ['before', 'node', 'lint', 'check']]
names += [str(path.relative_to(root)) for path in sorted(
    (logs / 'application-chats-codeql-report').rglob('*.sarif'))]
write_hashed_archive(root,
                     root / 'docs/case-studies/issue-56/data/application-chats-codeql.tar.gz',
                     names, {'parent': '8250c313', 'securityRun': 43825987290,
                             'focusedChecks': 3, 'hostedAccepted': False,
                             'remainingRows': 60}, 7)
