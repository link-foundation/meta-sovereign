"""Exercise real service and UI omissions on the published pre-skip source."""
from application_parent_fixture import published_application_sources, run_parent_application_probe
import subprocess
import sys

parent = 'e2acf88a7bdee8ba4df94015036b612463e7ebed'
paths = subprocess.check_output(['git', 'diff', '--name-only', parent, '--', 'js/src'], text=True).splitlines()
native = '--native' in sys.argv
with published_application_sources(__file__, parent, paths) as (root, env):
    command = ['node', 'experiments/issue-56/vacancy-skips-native.mjs', '--before'] if native else [
        'node', '--test', '--test-concurrency=1', 'js/tests/job-vacancy-skips.test.js',
        'js/tests/job-vacancy-skips-interface.test.js']
    path, result = run_parent_application_probe(root, env, 'vacancy-skips', command, native)
    text = path.read_text()
    assert result.returncode != 0 and 'ERR_MODULE_NOT_FOUND' not in text
    assert ('persisted refusal controls must survive' if native else "is not a function") in text
    print(f'Expected actual-parent refusal-registry failure; parent={parent}; native={native}; exit={result.returncode}')
