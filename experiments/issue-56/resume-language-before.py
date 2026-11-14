"""Reproduce the published title-only selection without a provider connection."""
import subprocess
import sys
from application_parent_fixture import published_application_sources

with published_application_sources(__file__, 'e8533c0c') as (root, env):
    native = '--native' in sys.argv
    command = ['node', '--max-old-space-size=384']
    if native:
        command += ['experiments/issue-56/resume-language-native.mjs']
        env = dict(env, RESUME_LANGUAGE_BEFORE='1', RESUME_LANGUAGE_SCREENSHOTS='docs/screenshots')
    else:
        command += ['--test', '--test-concurrency=1', '--test-name-pattern=checked native export language outranks', 'js/tests/job-resume-language.test.js']
    path = root / f'ci-logs/resume-language-before{"-native" if native else ""}.log'
    with path.open('wb') as log:
        result = subprocess.run(command, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    content = path.read_text()
    assert result.returncode != 0 and ('russian-new' in content if not native else 'A checked Russian export must outrank title hints.' in content), content
    print('Exact published parent selects a title hint over a checked Russian export; sources restored and fixtures drained')
