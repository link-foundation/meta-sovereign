"""Reproduce the exact parent's missing HH gate and restore all working sources."""
import sys
from application_parent_fixture import published_application_sources, run_parent_application_probe

discovery = '--discovery' in sys.argv
parent = ('c976dc985f3629afcb6f6fd6bc446d2a4d89439e' if discovery else
          'b4257480b578ae831db564d2a1965ef93b625ab4')
native = '--native' in sys.argv
prefix = 'hh-discovery' if discovery else 'hh-captcha'
with published_application_sources(__file__, parent) as (root, env):
    env.update(NODE_OPTIONS='--max-old-space-size=384',
               APPLICATION_SCREENSHOTS='' if discovery else 'docs/screenshots',
               APPLICATION_HH_CAPTCHA_BEFORE='0' if discovery else '1')
    command = (['node', 'experiments/issue-56/hh-captcha-native.mjs'] if native else
               ['node', '--test', '--test-concurrency=1', f'js/tests/{prefix}-boundaries.test.js'])
    path, result = run_parent_application_probe(root, env, prefix, command, native)
    assert result.returncode != 0, 'Parent unexpectedly recognizes and protects the HH challenge.'
    expected = (('readResumeListDocument ignored HH verification.' if native else
                 'Discovery payload read before verification:') if discovery else
                ('HH text CAPTCHA boundary is missing.' if native else 'Challenge payload access: answer'))
    assert expected in path.read_text(), path
    print(f'Expected parent failure retained: {path.name}')
