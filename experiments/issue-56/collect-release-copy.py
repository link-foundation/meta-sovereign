"""Preserve measured preparation work, bounded regression and hosted failures."""
import json
from pathlib import Path
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
read = lambda name: (root / f'ci-logs/release-copy-{name}.log').read_text()
assert 'fail 2' in read('before-node') and 'pass 1' in read('before-node')
assert 'pass 6' in read('node') and '6 passed | 0 failed' in read('deno')
assert 'pass 1' in read('cli') and 'pass 1' in read('tamper')
assert not read('lint') and not read('secrets')
assert 'ERROR' not in read('duplication')
profiles = {kind: json.loads(read(f'{kind}-profile').splitlines()[-1])
            for kind in ['before', 'after']}
assert profiles['before']['counts']['mkdir'] == 1456
assert profiles['after']['counts']['mkdir'] == profiles['after']['distinctDirectories'] == 34
assert profiles['before']['counts']['copyFile'] == profiles['after']['counts']['copyFile'] == 1455
logs = evidence_logs(root, 'release-copy')
logs = [name for name in logs if not name.endswith('parent-checks-43040716998.log')]
bundle(root, [
    *changed_sources(root, '4916921f'), *logs,
    'experiments/issue-56/rolling-startup-profile.mjs',
    'js/tests/rolling-cli.test.js', 'js/tests/rolling-cli-readiness.test.js',
    'js/tests/helpers/rolling-cli-readiness.mjs',
    'ci-logs/whole-turn-windows-deno-130595253101.log',
    'ci-logs/whole-turn-macos-node-130595253486.log',
], 'docs/case-studies/issue-56/data/ci-release-copy.tar.gz', {
    'parent': '4916921f', 'parent_failed': 2, 'focused_node': 6,
    'focused_deno': 6, 'actual_cli': 1, 'actual_tamper': 1,
    'profiles': profiles, 'copy_concurrency_limit': 4,
    'readiness_budget_ms': 10000,
    'remaining': 'Exact-head hosted readiness and every unchecked issue criterion.',
}, 'no-ci-release-copy-screenshots', before={
    'js/src/server/rolling-release.js': '4916921f',
})
