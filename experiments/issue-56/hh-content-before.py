"""Reproduce content reads past HH gates using the exact published source."""
import sys
from application_parent_fixture import published_application_sources, run_parent_application_probe

parent = '63f9f5592a3b27765a9acbbe58e49ce312d626e0'
native = '--native' in sys.argv
with published_application_sources(__file__, parent) as (root, env):
    env.update(NODE_OPTIONS='--max-old-space-size=384')
    command = (['node', 'experiments/issue-56/hh-content-native.mjs'] if native else
               ['node', '--test', '--test-concurrency=1', 'js/tests/hh-content-boundaries.test.js'])
    path, result = run_parent_application_probe(root, env, 'hh-content', command, native)
    assert result.returncode != 0, 'Parent unexpectedly holds before content inspection.'
    assert ('Assignment instructions escaped HH verification.' if native else
            'Content read before HH verification:') in path.read_text(), path
    print(f'Expected exact-parent failure retained: {path.name}')
