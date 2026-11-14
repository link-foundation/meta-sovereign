"""Reproduce the exact parent's missing HH gate and restore all working sources."""
import sys
from application_parent_fixture import published_application_sources, run_parent_application_probe

parent = 'b4257480b578ae831db564d2a1965ef93b625ab4'
native = '--native' in sys.argv
with published_application_sources(__file__, parent) as (root, env):
    env.update(NODE_OPTIONS='--max-old-space-size=384',
               APPLICATION_SCREENSHOTS='docs/screenshots', APPLICATION_HH_CAPTCHA_BEFORE='1')
    command = (['node', 'experiments/issue-56/hh-captcha-native.mjs'] if native else
               ['node', '--test', '--test-concurrency=1', 'js/tests/hh-captcha-boundaries.test.js'])
    path, result = run_parent_application_probe(root, env, 'hh-captcha', command, native)
    assert result.returncode != 0, 'Parent unexpectedly recognizes and protects the HH challenge.'
    expected = 'HH text CAPTCHA boundary is missing.' if native else 'Challenge payload access: answer'
    assert expected in path.read_text(), path
    print(f'Expected parent failure retained: {path.name}')
