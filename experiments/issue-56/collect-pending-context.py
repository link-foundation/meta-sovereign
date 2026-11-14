"""Preserve complete hosted failures and bounded integration-check evidence."""
from pathlib import Path
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
read = lambda name: (root / f'ci-logs/context-whole-turn-{name}.log').read_text()
assert 'fail 3' in read('before')
assert 'pass 38' in read('node') and '38 pass' in read('bun')
assert '38 passed | 0 failed' in read('deno')
assert '"legacyPredicate":false' in read('watch-phase')
assert '[e2e-questions] OK (webkit)' in read('webkit')
assert not read('lint') and not read('secrets')
assert '6.49%' in read('duplication') and 'ERROR' not in read('duplication')
bundle(root, [
    *changed_sources(root), *evidence_logs(root, 'context-whole-turn'),
    'experiments/issue-56/chat-model-mcp-server.mjs',
    '.playwright-mcp/console-2026-11-11T15-47-24-034Z.log',
], 'docs/case-studies/issue-56/data/ci-pending-context.tar.gz', {
    'parent': 'b8c0484467c15729ed4aac05755fbe57d14f10f0',
    'hosted_failed_parent': '4916921fb16d8a186cb89c6c837b47f90311bc22',
    'before_failures': 3, 'node': 38, 'bun': 38, 'deno': 38,
    'watch_phases': ['starting', 'ready', 'prefilled', 'owner-draft'],
    'prefills': 1, 'sends': 0, 'webkit': 'matching', 'mcp': 'opening trace',
    'remaining': 'Exact-head CI, unresolved disclosure/navigation and every unchecked issue criterion.',
}, 'no-pending-context-screenshots', before={
    'js/tests/question-context.test.js': 'b8c04844',
    'js/tests/question-pending-plan.test.js': 'b8c04844',
})
