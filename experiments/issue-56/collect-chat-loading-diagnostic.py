"""Preserve the actual hosted failure and bounded opt-in diagnostic checks."""
import json
from evidence_bundle import evidence_context, write_hashed_archive

root, logs, read = evidence_context(__file__, 'chat-loading-diagnostic')
assert 'pass 12' in read('focused') and 'fail 0' in read('focused')
assert '[e2e-chat-loading] OK (webkit)' in read('browser')
for scenario in ['resized-columns-reload', 'stories-disabled-reload']:
    assert f'"scenario":"{scenario}","phase":"passed"' in read('browser')
assert not read('lint').strip()
assert 'All matched files use Prettier code style!' in read('format')
runs = json.loads((logs / '6a2b-final-runs.json').read_text())
assert len(runs) == 5 and all(r['headSha'] ==
    '6a2b60cbd8adbbfbdcc652a7ea56e6de81224793' for r in runs)
assert sum(r['conclusion'] == 'failure' for r in runs) == 1
failed = (logs / 'checks-43995881927-webkit-2-final.log').read_text()
assert 'page.reload: The network connection was lost.' in failed
assert '[e2e-chat-loading] OK (webkit)' in (logs / 'chat-loading-webkit-probe.log').read_text()
names = [
    'js/tests/e2e-chat-loading-browser.mjs', 'js/tests/e2e-page-errors.test.js',
    'js/tests/helpers/e2e-page-errors.mjs',
    'docs/case-studies/issue-56/ci-webkit-reload.md',
    'experiments/issue-56/collect-chat-loading-diagnostic.py',
    'experiments/issue-56/evidence_bundle.py',
    'ci-logs/6a2b-final-runs.json',
    'ci-logs/checks-43995881927-webkit-2-final.log',
    'ci-logs/chat-loading-webkit-probe.log',
    'ci-logs/browser-webkit-2-43995881927/chat-loading.log',
    'ci-logs/browser-webkit-2-43995881927/ms-e2e-chat-loading-webkit.png',
]
names += [str(p.relative_to(root)) for p in logs.glob('chat-loading-diagnostic-*.log')
          if not p.name.endswith(('-commit.log', '-archive.log'))]
write_hashed_archive(root,
    root / 'docs/case-studies/issue-56/data/ci-webkit-reload.tar.gz', names,
    dict(acceptance=False, causeConfirmed=False, hostedRun=43995881927,
         hostedJob=133749902791, focusedTests=12, localWebKitPasses=2,
         exactSourceHostedVerificationRequired=True), 3)
