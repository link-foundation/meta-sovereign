"""Replay finite native-owner draft refusals against the published plain sender."""
import os
from parent_replay import replay_parent

os.environ['COMPOSER_BEFORE'] = '1'

replay_parent(__file__, 'browser-composer-draft', '623a144c', [
    ('sender', 'js/src/sources/browser-sender.js', [
        'node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
        'js/tests/browser-composer-draft.test.js']),
    ('native', 'js/src/sources/browser-sender.js', [
        'node', '--max-old-space-size=384',
        'experiments/issue-56/browser-composer-native.mjs']),
])
