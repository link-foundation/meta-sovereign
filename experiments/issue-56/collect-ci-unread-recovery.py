"""Preserve the shared-pass fixture regression without duplicating matrix logs."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'ci-unread-recovery')
parent = '6816d1586241a68e37553d938e2a1f1c818399f6'
assert 'locator.fill: Timeout 30000ms exceeded.' in read('before')
assert 'disabled max="100"' in read('before')
verified = read('browser-verified')
assert verified.count(' PASS ') == 9 and '"cases":5' in verified and '"cases":4' in verified
assert verified.count('"pageErrors":[]') == 2
for name in ['lint', 'secretlint']:
    assert not read(f'{name}-verified').strip()
assert 'ERROR' not in read('duplication-verified')
assert 'All matched files use Prettier code style!' in read('format-check-verified')
bundle(root, [*changed_sources(root), *evidence_logs(root, 'ci-unread-recovery'),
              'ci-logs/unread-polling-parent-checks-43146149020.json'],
       'docs/case-studies/issue-56/data/ci-unread-recovery.tar.gz',
       dict(parent=parent, browser_cases=9, live_provider=False,
            preserved_guards=['recover-before-start', 'no-replayed-visits', 'no-replayed-sends'],
            full_parent_log='unread-polling.tar.gz',
            unfinished='All unchecked issue-56 criteria and current-head hosted CI'),
       'issue-56-ci-unread-recovery/*/*.png', before={name: parent for name in (
           'js/tests/helpers/e2e-question-unread-controls.mjs',
           'js/tests/helpers/e2e-unread-notice-controls.mjs')})
