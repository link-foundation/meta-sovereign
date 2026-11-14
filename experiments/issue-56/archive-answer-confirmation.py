"""Preserve the bounded answer-confirmation reproduction and verification."""
from pathlib import Path
import hashlib
import json
import runpy
import shutil

root = Path(__file__).resolve().parents[2]
source = root / 'ci-logs/answer-confirmation-evidence'
source.mkdir(parents=True, exist_ok=True)
logs = [
    'ci-answer-ack-before.log', 'ci-answer-ack-after.log',
    'ci-answer-ack-deno.log', 'ci-answer-ack-compatibility.log',
    'ci-answer-ack-browser-after.log', 'ci-answer-ack-build.log',
    'ci-answer-ack-lint.log', 'ci-answer-ack-format-check.log',
    'ci-answer-ack-mcp.json', 'ci-answer-ack-mcp-after-console.log',
    'ci-browser-input-mcp-console.log',
    'ci-browser-model-input-probe.log',
    'ci-browser-navigation-scroll-probe.log',
    'ci-browser-question-refusal-probe.log',
    'ci-answer-ack-precommit-runs.json',
]
files = [f'ci-logs/{name}' for name in logs] + [
    'js/src/web/question-api.js', 'js/src/web/question-controls.js',
    'js/src/web/answer-model-settings.js', 'js/src/web/app-route.js',
    'js/tests/question-api-confirmation.test.js',
    'js/tests/e2e-questions-browser.mjs',
    'js/tests/e2e-navigation-browser.mjs',
    'js/tests/e2e-forms-reader-browser.mjs',
    'js/tests/helpers/e2e-form-model.mjs',
    'js/tests/helpers/e2e-input-trace.mjs',
    'experiments/issue-56/browser-input-mcp.mjs',
]
for name in files:
    target = source / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(root / name, target)
images = {}
for suffix in ['before', 'after', 'mobile']:
    name = f'docs/screenshots/issue-56-answer-ack-{suffix}.png'
    images[name] = hashlib.sha256((root / name).read_bytes()).hexdigest()
(source / 'screenshots.sha256.json').write_text(json.dumps(images, indent=2) + '\n')
runpy.run_path(str(root / 'experiments/issue-56/archive-evidence.py'))['archive'](
    source, root / 'docs/case-studies/issue-56/data/question-response-confirmation.tar.gz'
)
