"""Preserve finite notice admission, receipt and cross-surface recovery evidence."""
import json
from pathlib import Path
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
parent = 'ebd6f80d2cf787a6b49fc4bdc33ddbfdb41faa53'
read = lambda name: (logs / f'unread-notice-{name}.log').read_text()
for runtime, expected in [('node', 'pass 42'), ('deno', '42 passed | 0 failed'),
                          ('registry', 'pass 1'), ('registry-deno', '1 passed | 0 failed')]:
    assert expected in read(f'{runtime}-verified')
assert 'fail 1' in read('before-node')
assert 'Restored both working sources' in read('before-summary')
assert json.loads(read('before-browser').splitlines()[-1])['missingNoticeAdmission']
native = json.loads(read('browser-final').splitlines()[-1])
compatibility = json.loads(read('readonly-compatibility').splitlines()[-1])
mcp = json.loads((logs / 'unread-notice-mcp-final.json').read_text())
assert native['cases'] == 4 and not native['pageErrors']
assert compatibility['cases'] == 5 and not compatibility['pageErrors']
assert len(mcp['cases']) == 6 and mcp['scans'] == 6 and mcp['sends'] == 5
assert not any(mcp[key] for key in ('pending', 'prefills', 'reads', 'pageErrors'))
assert not read('lint-verified').strip() and not read('secretlint-verified').strip()
assert 'ERROR' not in read('duplication-verified')
assert 'All matched files use Prettier code style!' in read('format-check-verified')
bundle(root, [*changed_sources(root), *evidence_logs(root, 'unread-notice')],
       'docs/case-studies/issue-56/data/unread-notices.tar.gz',
       dict(parent=parent, focused_per_runtime=42, registry_per_runtime=1,
            native=native, read_only_compatibility=compatibility, mcp=mcp,
            explicit_finite_notice_delivery=True, polling=False,
            original_empty_chat_reveal=False, authenticated_provider=False,
            unfinished='QA17, HH09, HH10 and all unchecked issue-wide criteria'),
       'issue-56-unread-notices/*.png', before={name: parent for name in (
           'js/src/automation/question-browser.js', 'js/src/web/app.min.js')})
