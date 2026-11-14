"""Retain the exact hosted failure and finite disclosure observations."""
import json
import sys
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

if '--auto' in sys.argv:
    root, _, read = evidence_context(__file__, 'ci-follow-auto')
    assert '[e2e-follow-auto] OK (webkit)' in read('native')
    snapshots = [json.loads(line.split(' ', 1)[1]) for line in read('native').splitlines()
                 if line.startswith('[follow-disclosure] ')]
    clicked = next(row for row in snapshots if row['phase'] == 'auto-after-summary-click')
    assert clicked['open'] and any(event['trusted'] and event['type'] == 'click'
                                  for event in clicked['events'])
    assert not read('lint').strip() and not read('secrets').strip()
    assert 'All matched files use Prettier code style!' in read('format')
    assert 'ERROR: jscpd' not in read('duplication')
    sources = changed_sources(root) + evidence_logs(root, 'ci-follow-auto')
    sources += ['js/tests/helpers/e2e-follow-disclosure-trace.mjs',
                'ci-logs/checks-43600700798-webkit-2.log',
                'ci-logs/artifacts-43600700798-webkit-2/summary.json']
    bundle(root, sources, 'docs/case-studies/issue-56/data/ci-follow-auto.tar.gz',
           dict(hosted_commit='c976dc985f3629afcb6f6fd6bc446d2a4d89439e',
                run=43600700798, failed_job=132465586160, raw_lines=[1517,1540],
                local_webkit_workflows=1, native_click_and_deadlines_unchanged=True,
                cause_proven=False, issue_complete=False),
           'issue-56-ci-telegram-backlinks/auto-hosted-closed.png',
           before={'js/tests/e2e-follow-auto-browser.mjs': '63f9f559'})
    sys.exit(0)

root, _, read = evidence_context(__file__, 'ci-telegram-backlinks')
assert '[e2e-follow-telegram-backlinks] OK (webkit)' in read('focused')
snapshots = [json.loads(line.split(' ', 1)[1]) for line in read('focused').splitlines()
             if line.startswith('[follow-disclosure] ')]
assert any(row.get('open') and any(event['trusted'] and event['type'] == 'toggle'
           for event in row.get('events', [])) for row in snapshots)
assert not read('lint').strip()
assert not read('secrets').strip()
assert 'All matched files use Prettier code style!' in read('static')
assert 'ERROR: jscpd' not in read('duplication')
assert 'fieldVisible\\\":true' in (root / 'ci-logs/ci-telegram-backlinks-mcp.json').read_text()
base = '18b728fb3b5ecda42e478ce9d53fa21c5ec7e663'
sources = changed_sources(root, base) + evidence_logs(root, 'ci-telegram-backlinks')
sources += ['ci-logs/native-owner-parent-webkit3.log',
            'ci-logs/native-owner-parent-artifacts.json',
            'ci-logs/native-owner-parent-webkit3-artifacts/follow-telegram-backlinks.log']
sources += evidence_logs(root, 'telegram-backlinks')
bundle(root, sources, 'docs/case-studies/issue-56/data/ci-telegram-backlinks.tar.gz',
       dict(hosted_commit='bd954afdf44e681abbf5d4cc97b1bd8ed50efb9a',
            run=43487554932, failed_job=132101730005, raw_lines=[1918, 1939],
            local_webkit_workflows=1, local_mcp_openings=1,
            native_click_and_deadlines_unchanged=True, cause_proven=False,
            issue_complete=False), 'issue-56-ci-telegram-backlinks/*.png',
       before={'js/tests/e2e-follow-telegram-backlinks-browser.mjs': base})
