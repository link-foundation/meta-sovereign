"""Reproduce the coexisting native challenge refusal on the exact published parent."""
import sys
from application_parent_fixture import published_application_sources, run_parent_application_probe

parent = 'cd2a3337fa7222f924e4b55c60b3503fabd8dacd'
native = '--native' in sys.argv
with published_application_sources(__file__, parent) as (root, env):
    command = ['node', '--max-old-space-size=384']
    if native:
        command += ['experiments/issue-56/application-limit-challenge-native.mjs', '--parent-flow']
        env = dict(env, E2E_ARTIFACT_DIR='docs/screenshots/issue-56-limit-challenge-before')
    else:
        command += ['--test', '--test-concurrency=1', '--test-name-pattern=daily-limit close follows',
                    'js/tests/job-application-limit-challenge.test.js']
    path, result = run_parent_application_probe(root, env, 'hh-limit-captcha', command, native)
    assert result.returncode != 0, path.read_text()
    assert 'Coexisting CAPTCHA prevented the acknowledged daily-limit draft.' in path.read_text(), path.read_text()
    print(f'Published-parent failure retained: {path.name}; working sources restored and owned fixtures drained.')
