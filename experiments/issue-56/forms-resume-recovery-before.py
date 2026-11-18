"""Reproduce the published assertion after a real saved-PDF deletion."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
name = 'js/tests/helpers/e2e-form-private-resume.mjs'
current = (root / name).read_bytes()
parent = '1f0c7287b7869c2a41fea826c84723607d3156dd'
try:
    (root / name).write_bytes(subprocess.check_output(
        ['git', 'show', f'{parent}:{name}'], cwd=root))
    with (root / 'ci-logs/forms-resume-recovery-before.log').open('w') as log:
        result = subprocess.run(
            ['node', 'js/tests/e2e-forms-reader-browser.mjs'], cwd=root,
            env=dict(os.environ, RUN_BROWSER_E2E='1',
                FORMS_RESUME_RECOVERY_ONLY='1',
                E2E_EXECUTABLE_PATH='/usr/bin/google-chrome',
                E2E_ARTIFACT_DIR='ci-logs/forms-resume-recovery-before',
                NODE_OPTIONS='--max-old-space-size=384'),
            stdout=log, stderr=subprocess.STDOUT)
    text = Path(log.name).read_text()
    assert result.returncode == 1
    assert '[forms-configured-resume]' in text
    assert 'assertion failed: discovery never writes a saved PDF selection' in text
    print('Reproduced the published assertion after actual saved-PDF deletion')
finally:
    (root / name).write_bytes(current)
