"""Bounded native reproduction against the published virtual-list reveal code."""
import subprocess
from application_parent_fixture import published_application_sources

with published_application_sources(__file__, 'e8533c0c') as (root, env):
    with (root / 'ci-logs/unread-reveal-before.log').open('wb') as log:
        result = subprocess.run([
            'node', '--max-old-space-size=384',
            'experiments/issue-56/unread-reveal-native.mjs',
        ], cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    text = (root / 'ci-logs/unread-reveal-before.log').read_text()
    assert result.returncode != 0 and 'browser-chat-view-chat-unavailable' in text
    print('Published reveal refuses the gated render; original sources restored and fixtures drained')
