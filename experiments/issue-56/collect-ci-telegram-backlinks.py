"""Retain the exact hosted failure and finite disclosure observations."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

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
