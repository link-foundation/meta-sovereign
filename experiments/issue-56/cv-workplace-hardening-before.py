"""Replay four finite regressions against their actual published modules."""
from pathlib import Path
from parent_replay import replay_parent

parent = 'ee7a74e466c49498ee47ece193a30e55559a65ec'
test = 'js/tests/cv-workplace-identity.test.js'
cases = [
    ('exports', 'js/src/jobs/cv-watch-verification.js', 'workplace evidence refuses extra exports'),
    ('metadata', 'js/src/jobs/cv-watch-verification.js', 'workplace evidence refuses unobserved metadata'),
    ('identity', 'js/src/jobs/cv-workplace-readback.js', 'native workplace readback binds'),
    ('body', 'js/src/jobs/cv-watch-export.js', 'native record fetch uses'),
]
replay_parent(__file__, 'cv-workplace-hardening', parent, [
    (name, target, ['node', '--test', '--test-concurrency=1',
                    '--test-name-pattern=' + pattern, test])
    for name, target, pattern in cases
])
root = Path(__file__).resolve().parents[2]
for name, _, _ in cases:
    log = (root / f'ci-logs/cv-workplace-hardening-{name}-before.log').read_text()
    assert 'ERR_ASSERTION' in log and 'fail 1' in log, name
