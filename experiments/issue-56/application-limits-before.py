"""Bounded exact-parent regression, restoring all production sources afterward."""
import subprocess
import sys
from application_parent_fixture import published_application_sources

with published_application_sources(__file__, '8ab11c52') as (root, env):
    native = '--native' in sys.argv
    command = ['node', '--max-old-space-size=384']
    if native:
        command += ['experiments/issue-56/application-limits-native.mjs']
        env = dict(env, APPLICATION_LIMIT_BEFORE='1', APPLICATION_SCREENSHOTS='docs/screenshots')
    else:
        command += ['--test', '--test-concurrency=1', '--test-name-pattern=visible daily refusal keeps', 'js/tests/job-application-limit.test.js']
    log_path = root / f'ci-logs/application-limits-before{"-native" if native else ""}.log'
    bundle = root / 'js/src/web/app.min.js'
    original_bundle = bundle.read_bytes()
    try:
        with log_path.open('wb') as log:
            if native:
                subprocess.run(['node', 'js/scripts/build-web.mjs'], cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
            result = subprocess.run(command, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    finally:
        bundle.write_bytes(original_bundle)
    expected = 'Durable daily application pause is missing.' if native else 'actual: undefined'
    assert result.returncode != 0 and expected in log_path.read_text(), log_path.read_text()
    print('Exact parent regression reproduced; production sources restored and fixtures drained.')
