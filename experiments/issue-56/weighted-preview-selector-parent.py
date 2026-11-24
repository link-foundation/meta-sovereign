"""Reproduce the published lookup with the preceding scenario's inspection state."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
name = 'js/tests/helpers/e2e-question-weighted.mjs'
file = root / name
current = file.read_bytes()
parent = subprocess.check_output(['git', 'show',
    f'4bb612207b6cc2673862a6f5a196d13775096a6b:{name}'], cwd=root).decode()
assert parent.count('await letterCase.uncheck();') == 1
# Reconstruct exactly the valid inspection choice left by the preceding test.
reproducer = parent.replace('await letterCase.uncheck();',
    "await letterCase.uncheck();\n    await preview.getByLabel('Inspect all eligible matches').check();")
(root / 'ci-logs/weighted-preview-selector-reproducing-helper.mjs').write_text(reproducer)
env = dict(os.environ, RUN_BROWSER_E2E='1', QUESTION_WEIGHTED_ONLY='1',
    E2E_EXECUTABLE_PATH='/usr/bin/google-chrome',
    E2E_ARTIFACT_DIR='ci-logs/weighted-preview-selector-before',
    NODE_OPTIONS='--max-old-space-size=384')
try:
    file.write_text(reproducer)
    with (root / 'ci-logs/weighted-preview-selector-before.log').open('w') as log:
        result = subprocess.run(['node', 'js/tests/e2e-questions-browser.mjs'],
            cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1
    text = Path(log.name).read_text()
    assert 'resolved to 2 elements' in text and 'strict mode violation' in text
finally:
    file.write_bytes(current)
