"""Archive repeated-check ownership, drainage and read-only recovery evidence."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'unread-polling')
parent = 'ec871d26811be18b42ff6de892da484f10d8cdca'
for runtime, expected in [('node', 'pass 39'), ('deno', '39 passed | 0 failed'),
                          ('registry', 'pass 1'), ('registry-deno', '1 passed | 0 failed')]:
    assert expected in read(f'{runtime}-verified')
assert 'fail 1' in read('before-node')
assert 'Restored the working facade' in read('before-summary')
browser = json.loads(read('browser').splitlines()[-1])
mcp = json.loads((logs / 'unread-polling-mcp-verified.json').read_text())
compatibility = json.loads((logs / 'unread-polling-compat-mcp-verified.json').read_text())
assert browser['cases'] == 5 and not browser['pageErrors']
assert len(mcp['cases']) == 5 and mcp['scans'] >= 2
assert not any(mcp[key] for key in ('pending', 'sends', 'prefills', 'reads', 'pageErrors'))
assert len(compatibility['cases']) == 5 and compatibility['sends'] == 2
assert not read('lint-verified').strip() and not read('secretlint-verified').strip()
assert 'ERROR' not in read('duplication-verified')
assert 'All matched files use Prettier code style!' in read('format-check-verified')
bundle(root, [*changed_sources(root), *evidence_logs(root, 'unread-polling')],
       'docs/case-studies/issue-56/data/unread-polling.tar.gz',
       dict(parent=parent, focused_per_runtime=39, registry_per_runtime=1,
            browser=browser, mcp=mcp, reply_view_compatibility=compatibility,
            reply_view_transient_failure_preserved=True,
            authenticated_provider=False,
            unfinished='QA17/HH09/HH10 provider parity and all unchecked issue criteria'),
       'issue-56-unread-polling/*.png', before={
           'js/src/automation/question-browser.js': parent,
           'js/src/web/question-unread-controls.js': parent})
