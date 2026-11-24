"""Replay the same native coordinate loss against the actual failing helper."""
from parent_replay import replay_parent

replay_parent(__file__, 'watch-coordinate', '8c2260b6', [
    ('native', 'js/tests/helpers/e2e-question-browser-watch.mjs',
     ['node', 'experiments/issue-56/watch-disclosure-coordinate.mjs', '--before'])])
