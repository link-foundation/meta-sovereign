"""Exercise the preceding CI runner's missing Forms group without a browser."""
import json
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
parent = 'ee447589d14829aacd692cb0a9e7d98f17479723'
with tempfile.TemporaryDirectory(prefix='forms-groups-before-') as temporary:
    cwd = Path(temporary)
    scripts = cwd / 'js/scripts'
    scripts.mkdir(parents=True)
    helpers = cwd / 'js/tests/helpers'
    helpers.mkdir(parents=True)
    (helpers / 'e2e-reduced-effects.mjs').write_text('// isolated runner fixture\n')
    (scripts / 'run-browser-checks.mjs').write_bytes(subprocess.check_output(
        ['git', 'show', f'{parent}:js/scripts/run-browser-checks.mjs'], cwd=root))
    (scripts / 'browser-checks.json').write_text(json.dumps(['forms-answers']))
    (cwd / 'package.json').write_text(json.dumps({'scripts': {
        'test:e2e:forms-answers': 'node fixture.mjs'}}))
    (cwd / 'fixture.mjs').write_text("console.log('group:' + process.env.FORMS_GROUP);\n")
    result = subprocess.run(['node', 'js/scripts/run-browser-checks.mjs'],
                            cwd=cwd, capture_output=True, text=True,
                            env={'PATH': __import__('os').environ['PATH']})
    log = result.stdout + result.stderr
    (root / 'ci-logs/forms-captcha-groups-before.log').write_text(log)
    assert result.returncode == 0 and 'group:undefined' in log, log
