"""Verify and retain the decorated-draft regression without external accounts."""
import hashlib
import json
from pathlib import Path
import runpy
import shutil
import tempfile

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'pass 18' in (logs / 'forms-plain-tests.log').read_text()
assert '18 passed | 0 failed' in (logs / 'forms-plain-deno.log').read_text()
assert not (logs / 'forms-plain-lint.log').read_text().strip()
assert "value: '**I build accessible browser interfaces.**'" in (logs / 'forms-plain-before.log').read_text()
assert 'selected CV produces a reviewed proposal' in (logs / 'forms-plain-browser-before.log').read_text()
assert 'OK (chromium)' in (logs / 'forms-plain-browser-after.log').read_text()
receipt = json.loads((logs / 'forms-plain-mcp.json').read_text())
assert receipt['modelCalls'] == 1 and receipt['submissions'] == 0
assert receipt['reads'][0]['closed'] and not receipt['phoneOverflow']
assert receipt['reads'][0]['values'] == dict(fullName='Owner retains this answer',
    background='I build accessible browser interfaces.', starting='')
paths = ['js/src/automation/answer-plain-text.js', 'js/src/automation/answer-model-drafts.js',
    'js/tests/answer-plain-text.test.js', 'js/tests/helpers/e2e-form-model.mjs',
    'experiments/issue-56/forms-model-fixture.mjs', 'experiments/issue-56/forms-plain-baseline.py',
    'experiments/issue-56/collect-form-plain.py', 'docs/case-studies/issue-56/forms-plain-drafts.md',
    'ci-logs/forms-capacity-webkit-130147210202.log',
    'ci-logs/forms-model-lint-130164660346.log']
paths += [f'ci-logs/forms-plain-{suffix}' for suffix in ('tests.log', 'deno.log', 'lint.log',
    'format.log', 'format-final.log', 'build.log', 'before.log', 'browser-before.log',
    'browser-after.log', 'mcp.json', 'current-runs.json', 'capacity-parent-ci.json',
    'model-parent-ci.json', 'requirements-format.log', 'format-check.log')]
writer = runpy.run_path(str(root / 'experiments/issue-56/archive-evidence.py'))['archive']
with tempfile.TemporaryDirectory(prefix='form-plain-') as directory:
    stage = Path(directory)
    for name in paths:
        target = stage / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / name, target)
    (stage / 'metadata.json').write_text(json.dumps({
        'date': '2026-11-10', 'preceding_head': 'aa591e852357b700417de45fa1d75e285d51cdee',
        'node_checks': 18, 'deno_checks': 18, 'mcp': receipt,
        'screenshots': {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted((root / 'docs/screenshots').glob('issue-56-forms-plain-*.png'))},
    }, indent=2) + '\n')
    writer(stage, root / 'docs/case-studies/issue-56/data/forms-plain-drafts.tar.gz')
