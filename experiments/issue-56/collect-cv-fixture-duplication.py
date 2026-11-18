"""Preserve the exact hosted clone failure and shared fixture verification."""
from evidence_bundle import bundle, changed_sources
from pathlib import Path

root = Path(__file__).resolve().parents[2]
prefix = root / 'ci-logs'
logs = ['cv-workplace-identity-' + name + '.log' for name in [
    'concurrent-lint', 'merged-duplication', 'shared-duplication',
    'parent-replay', 'shared-fixtures', 'merged-node', 'merged-deno',
    'merged-browser', 'merged-gates']]
assert 'ERROR: jscpd' in (prefix / logs[1]).read_text()
assert 'ERROR' not in (prefix / logs[2]).read_text()
assert 'browser: expected actual-parent failure 1' in (prefix / logs[3]).read_text()
assert (prefix / logs[4]).read_text().count('drained shutdown pass') == 3
assert 'pass 61' in (prefix / logs[5]).read_text()
assert '61 passed | 0 failed' in (prefix / logs[6]).read_text()
assert '[e2e-cv-prepare] OK (webkit)' in (prefix / logs[7]).read_text()
sources = changed_sources(root) + [f'ci-logs/{name}' for name in logs]
sources += ['ci-logs/cv-workplace-identity-concurrent-ci.json',
            'ci-logs/cv-workplace-identity-final-duplication.log']
originals = [name for name in sources if name.startswith('experiments/')
             and name not in ['experiments/issue-56/parent_replay.py',
                              'experiments/issue-56/cv-review-mcp-fixture.mjs',
                              'experiments/issue-56/verify-cv-fixture-servers.py',
                              'experiments/issue-56/collect-cv-fixture-duplication.py']]
bundle(root, sources, 'docs/case-studies/issue-56/data/ci-cv-fixture-duplication.tar.gz',
       dict(parent='242d4ccddff0faf2ff53207e71125478b68dddf8', threshold=6.5,
            merged_node=61, merged_deno=61, fixture_servers=3,
            hosted_new_head='unfinished'),
       'no-cv-fixture-duplication-screenshots',
       before={name: 'ba133b66' for name in originals})
