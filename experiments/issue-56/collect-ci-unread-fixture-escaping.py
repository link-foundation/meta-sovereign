"""Preserve exact-head fixture serialization feedback and focused correction."""
from pathlib import Path
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
parent = '1447f467bd3dfd980d0621131c9bcc72aadcbdce'
logs = root / 'ci-logs'
assert 'fail 1' in (logs / 'unread-fixture-escape-before.log').read_text()
for name, expected in [('node', 'pass 3'), ('deno', '3 passed | 0 failed'),
                       ('registry', 'pass 1'), ('registry-deno', '1 passed | 0 failed')]:
    assert expected in (logs / f'ci-unread-fixture-{name}-verified.log').read_text()
bundle(root, [*changed_sources(root), *evidence_logs(root, 'ci-unread-fixture'),
              *evidence_logs(root, 'unread-fixture'),
              'ci-logs/unread-notices-workflow-43138399638.log',
              'ci-logs/unread-notices-codeql/javascript.sarif'],
       'docs/case-studies/issue-56/data/ci-unread-fixture-escaping.tar.gz',
       dict(parent=parent, node=3, deno=3, registry_per_runtime=1,
            before='closing script creates a second script element',
            unfinished='Original-empty-chat reveal, polling/backoff/lifetime and every unchecked issue criterion'),
       'issue-56-unread-fixture-escaping/*.png',
       before={'experiments/issue-56/chat-navigation-fixture.mjs': parent})
