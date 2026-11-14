"""Preserve the exact hosted failure and bounded deadline reproductions."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'captcha-deadline')
parent = '868b1f658cd4a7a577a63e07b33057a1638f06bf'
assert 'pass 27' in read('node-verified')
assert '27 passed | 0 failed' in read('deno-verified')
assert read('parent-replay').splitlines() == [
    'before: expected exit 1', 'after: expected exit 0']
probe = json.loads(read('probe'))
assert probe['failure'] == 'form-session-missing' and probe['textWrites'] == 0
assert any(event.get('ms', 101) <= 100 and event['elapsedMs'] > 200
           for event in probe['events'])
assert not read('lint-verified').strip()
assert not read('secretlint-verified').strip()
assert 'All matched files use Prettier code style!' in read('format-check-verified')
assert 'ERROR' not in read('duplication-verified')
bundle(root, [*changed_sources(root), *evidence_logs(root, 'captcha-deadline'),
              'ci-logs/vacancy-parent-checks-43150797918.log',
              'ci-logs/vacancy-parent-macos-43150797918-130961294453.log'],
       'docs/case-studies/issue-56/data/ci-captcha-deadline.tar.gz',
       dict(parent=parent, failed_head='727b3f6b30337d0f6de3041c7ab31d7b2b744cbf',
            failed_run=43150797918, failed_job=130961294453,
            focused_per_runtime=27, probe=probe, ordinary_deadline_ms=100,
            manual_ceiling_ms=2000, production_limits_changed=False,
            unfinished='Exact new-head CI and every unchecked issue criterion'),
       'issue-56-captcha-deadline/**/*.png',
       before={name: parent for name in (
           'js/src/forms/review-deadline.js',
           'js/src/forms/review-lifecycle.js',
           'js/tests/forms-captcha.test.js')})
