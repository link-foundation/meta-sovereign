"""Preserve public CI and deterministic tutorial-control regression evidence."""
import hashlib
import json
import tarfile
from pathlib import Path

workspace = Path(__file__).resolve().parents[2]
evidence = workspace / 'ci-logs'
assert 'pass 44' in (evidence / 'tutorial-control-tests.log').read_text()
assert '44 passed | 0 failed' in (evidence / 'tutorial-control-deno.log').read_text()
assert not (evidence / 'tutorial-control-lint.log').read_text().strip()
assert 'actual: \'clear\'' in (evidence / 'tutorial-control-visible-before.log').read_text()
assert 'FAIL (webkit)' in (evidence / 'tutorial-control-required-before.log').read_text()
assert 'OK (webkit)' in (evidence / 'tutorial-control-required-after.log').read_text()
assert 'all checks passed' in (evidence / 'tutorial-control-webkit-after.log').read_text()
failed = json.loads((evidence / 'tutorial-control-failed-run.json').read_text())
assert failed['headSha'] == 'cea1af881de48120c78528be6faeeb713e63a788'
assert failed['conclusion'] == 'failure'

preserve = [
    'ci-logs/forms-watchers-parent-full-42886382414.log',
    'ci-logs/tutorial-control-failed-run.json',
    'ci-logs/tutorial-control-visible-before.log',
    'ci-logs/tutorial-control-required-before.log',
    'ci-logs/tutorial-control-debug.log',
    'ci-logs/tutorial-control-required-after.log',
    'ci-logs/tutorial-control-webkit-before.log',
    'ci-logs/tutorial-control-webkit-after.log',
    'ci-logs/tutorial-control-webkit-resize.log',
    'ci-logs/tutorial-control-tests.log', 'ci-logs/tutorial-control-deno.log',
    'ci-logs/tutorial-control-lint.log', 'ci-logs/tutorial-control-build.log',
    'ci-logs/tutorial-control-format.log',
    'ci-logs/tutorial-control-current-runs.json',
    'js/src/web/tutorial.js', 'js/src/web/tutorial-clear.js',
    'js/tests/tutorial-clear.test.js', 'js/tests/e2e-tutorial-browser.mjs',
    'js/tests/e2e-tutorial-card-resize-browser.mjs',
    'js/tests/helpers/e2e-tutorial-control.mjs',
    'experiments/issue-56/tutorial-control-ui.mjs',
    'experiments/issue-56/collect-tutorial-control.py',
]
bundle = workspace / 'docs/case-studies/issue-56/data/tutorial-required-control.tar.gz'
expected = {}
with tarfile.open(bundle, 'w:gz') as output:
    for relative in preserve:
        source = workspace / relative
        expected[relative] = hashlib.file_digest(source.open('rb'), 'sha256').hexdigest()
        output.add(source, arcname=relative, recursive=False)
with tarfile.open(bundle, 'r:gz') as saved:
    for name, digest in expected.items():
        assert hashlib.file_digest(saved.extractfile(name), 'sha256').hexdigest() == digest
screenshots = {
    p.name: hashlib.sha256(p.read_bytes()).hexdigest()
    for p in (workspace / 'docs/screenshots').glob('issue-56-tutorial-required-control-*.png')
}
bundle.with_suffix('').with_suffix('.tar.sha256.json').write_text(json.dumps({
    'archive': bundle.name, 'files': expected, 'screenshots': screenshots,
    'node_checks': 44, 'deno_checks': 44,
    'mcp': {'top': 357.40625, 'bottom': 393.40625,
            'viewport_height': 560, 'clickable': True, 'closed': True},
}, indent=2) + '\n')
print(f'Verified {len(expected)} retained evidence entries.')
