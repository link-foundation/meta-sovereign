"""Retain the exact WebKit failure and finite document-identity regressions."""
import hashlib
import json
from pathlib import Path
import runpy
import shutil
import tempfile

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
for suffix, marker in [('tests.log', 'pass 58'), ('deno.log', '58 passed | 0 failed'),
                       ('browser-after.log', 'OK (webkit)'), ('before.log', 'form-changed'),
                       ('browser-before.log', 'lost response never triggers an implicit repeated application')]:
    assert marker in (logs / f'forms-identity-{suffix}').read_text()
assert (logs / 'forms-identity-deno-exit.txt').read_text().strip() == '0'
assert not (logs / 'forms-identity-lint.log').read_text().strip()
assert 'All matched files use Prettier code style!' in (logs / 'forms-identity-format-check.log').read_text()
receipt = json.loads((logs / 'forms-identity-mcp.json').read_text())
assert receipt['submissions'] == 0 and receipt['reads'][0]['closed']
assert receipt['readbackReceipts'] == 6 and not receipt['phoneOverflow']
assert receipt['reads'][0]['values']['fullName'] == 'Ada Example'
assert receipt['reads'][0]['values']['email'] == ''
selected = [f'js/src/forms/{name}.js' for name in
            ('read-document', 'inspection', 'review-targets', 'review-monitor', 'review-learning')]
selected += [f'js/tests/{name}.test.js' for name in
             ('forms-document-identity', 'forms-reader', 'forms-learning', 'forms-monitor',
              'forms-review-prefill', 'forms-review-sessions')]
selected += ['js/tests/e2e-forms-reader-browser.mjs', 'js/tests/helpers/e2e-form-prefill.mjs',
             'js/tests/helpers/forms-session-fixture.mjs',
             'docs/case-studies/issue-56/ci-form-document-identity.md']
selected += [f'experiments/issue-56/{name}' for name in
             ('forms-document-clock.mjs', 'forms-identity-baseline.py', 'collect-form-identity.py',
              'trace-form-document-identity.mjs', 'forms-reader-fixture.mjs', 'forms-reader-ui.mjs')]
selected += [f'ci-logs/forms-identity-{name}' for name in
             ('tests.log', 'deno.log', 'deno-exit.txt', 'lint.log', 'format-check.log', 'build.log',
              'before.log', 'browser-before.log', 'browser-after.log', 'native-clock.log',
              'mcp.json', 'mcp-server.log', 'current-runs.json',
              'capacity-parent-ci.json', 'capacity-parent-42904657245.log',
              'capacity-log-download.txt',
              'counter-parent-ci.json', 'counter-parent-42912217494.log',
              'plain-parent-ci.json', 'plain-parent-42914561321.log')]
selected += ['ci-logs/forms-capacity-webkit-130147210202.log']
archive = runpy.run_path(str(root / 'experiments/issue-56/archive-evidence.py'))['archive']
with tempfile.TemporaryDirectory(prefix='form-identity-') as directory:
    stage = Path(directory)
    for relative in selected:
        destination = stage / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / relative, destination)
    (stage / 'metadata.json').write_text(json.dumps({
        'date': '2026-11-10', 'preceding_head': 'dc74e618b13491aa90a212448a5cd5ae47fcb447',
        'failed_job': 130147210202, 'failed_job_log_line': 2299,
        'upstream_report': 'https://bugs.webkit.org/show_bug.cgi?id=258572',
        'native_drift_reproduced': False, 'node_checks': 58, 'deno_checks': 58,
        'mcp': receipt,
        'screenshots': {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                        for p in sorted((root / 'docs/screenshots').glob('issue-56-forms-identity-*.png'))},
    }, indent=2) + '\n')
    archive(stage, root / 'docs/case-studies/issue-56/data/ci-form-document-identity.tar.gz')
