"""Retain exact hosted failure, finite regressions and native final evidence."""
import hashlib
import json
from evidence_bundle import bundle, changed_sources, evidence_context

root, logs, read = evidence_context(__file__, 'rtc-open')
assert 'fail 2' in read('parent')
assert 'pass 19' in read('focused') and 'fail 0' in read('focused')
assert '[e2e-lino-sync] OK (webkit)' in read('browser')
assert not read('lint').strip() and not read('secrets').strip()
assert 'All matched files use Prettier code style!' in read('format-final')
assert 'Changeset validation passed' in read('changeset')
ci = json.loads((logs / 'rtc-open-parent-ci.json').read_text())
assert ci['headSha'].startswith('96a54d99') and ci['conclusion'] == 'failure'
sources = [name for name in changed_sources(root) if (root / name).is_file()
           and name != 'js/src/web/app.min.js']
sources += [f'ci-logs/rtc-open-{name}.log' for name in [
    'parent', 'focused', 'browser', 'build', 'lint', 'secrets', 'format-final', 'changeset']]
sources += ['ci-logs/rtc-open-native-diagnostic.log',
            'ci-logs/rtc-open-browser-send-failure.log',
            'ci-logs/rtc-open-browser-trace.log',
            'ci-logs/rtc-open-upstream-body.md',
            'ci-logs/rtc-open-upstream-created.log',
            'ci-logs/rtc-open-WebKit-RTCDataChannel.cpp',
            'ci-logs/rtc-open-playwright-wkPage.ts',
            'ci-logs/rtc-open-parent-ci.json',
            'ci-logs/deletions-parent-webkit-failure.log',
            'ci-logs/checks-43462136209.log',
            'ci-logs/deletions-browser.log',
            'ci-logs/register-webkit-artifacts/summary.json',
            'ci-logs/register-webkit-artifacts/ms-e2e-lino-sync-webkit.png']
bundle(root, sources, 'docs/case-studies/issue-56/data/rtc-open.tar.gz',
       dict(hosted_parent='96a54d99', source_parent='980e1f0b',
            run=43462136209, job=132013458396, parent_failures=2,
            focused_passes=19, native_webkit=True, full_local_matrix=False,
            native_diagnostic_reproduced=True, upstream_issue=44103,
            exact_head_ci_required=True, issue_complete=False,
            app_bundle_sha256=hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest()),
       'no-rtc-open-images-*.png',
       before={'js/src/sync/webrtc-transport.js': '980e1f0b'})
