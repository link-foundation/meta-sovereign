"""Reproduce the pre-persistence draft; restore source and bundle in all cases."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
source = root / 'js/src/web/job-login-panel.js'
bundle = root / 'js/src/web/app.min.js'
original, original_bundle = source.read_bytes(), bundle.read_bytes()
draft = original.replace(b'      remember?.(values);\n', b'')
assert draft != original
env = {**os.environ, 'RUN_BROWSER_E2E': '1', 'JOBS_LOGIN_SCREENSHOTS': '1'}
env.setdefault('E2E_EXECUTABLE_PATH', '/opt/google/chrome/chrome')
try:
    source.write_bytes(draft)
    with (root / 'ci-logs/job-login-recovery-draft-build.log').open('w') as log:
        subprocess.run(['node', '--max-old-space-size=384',
                        'js/scripts/build-web.mjs'], cwd=root, stdout=log,
                       stderr=subprocess.STDOUT, check=True)
    log_path = root / 'ci-logs/job-login-recovery-draft-targeted.log'
    with log_path.open('w') as log:
        result = subprocess.run(['node', '--max-old-space-size=384',
                                 'js/tests/e2e-jobs-manual-login-browser.mjs'],
                                cwd=root, env=env, stdout=log,
                                stderr=subprocess.STDOUT)
    assert result.returncode == 1
    assert 'browser-open' in log_path.read_text()
    picture = root / 'docs/screenshots/issue-56-jobs-login/recovery-failure.png'
    assert picture.read_bytes().startswith(b'\x89PNG\r\n\x1a\n')
    picture.rename(picture.with_name('recovery-before.png'))
    print(json.dumps({'sourceSha256': hashlib.sha256(original).hexdigest(),
                      'draftSha256': hashlib.sha256(draft).hexdigest(),
                      'draftExit': result.returncode, 'liveProvider': False}))
finally:
    source.write_bytes(original)
    bundle.write_bytes(original_bundle)
