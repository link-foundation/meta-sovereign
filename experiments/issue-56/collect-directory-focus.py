"""Preserve bounded keyboard reproduction and the complete hosted failure."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'chat-keyboard')
assert 'expected bounded Home regression failure' in read('parent-probe')
assert 'before viewport frames resume (Home)' in read('parent')
assert '"rendered":false,"start":133,"end":150,"top":0' in read('gated-diagnostic')
assert '[e2e-chat-responsiveness] OK (webkit)' in read('browser-final')
assert 'pass 18' in read('node') and 'fail 0' in read('node')
result = json.loads((logs / 'chat-keyboard-mcp-final-result.json').read_text())
assert any('"consoleErrors":[]' in entry.get('text', '') and
           '"clickSelection":true' in entry.get('text', '')
           for entry in result['content'])
assert 'Owned directory fixture closed' in read('mcp-final-server')
for check in ['lint-final', 'secrets', 'diff']:
    assert not read(check).strip(), check
assert 'All matched files use Prettier code style!' in read('prettier')
assert '0 over the 1500 line limit' in read('line-limits')
assert 'ERROR' not in read('duplication')
hosted = (logs / 'continuation-webkit-1-job.log').read_text().splitlines()
assert 'timed out: keyboard can focus a row outside the viewport' in hosted[810]
assert 'Browser checks failed: chat-responsiveness' in hosted[1225]
sources = [name for name in changed_sources(root)
           if name != 'js/src/web/app.min.js']
evidence = evidence_logs(root, 'chat-keyboard') + evidence_logs(root, 'continuation')
evidence += ['ci-logs/continuation-webkit-1-artifact.zip']
bundle(root, [*sources, *evidence],
       'docs/case-studies/issue-56/data/ci-directory-focus.tar.gz',
       dict(parent='1ea671cf39f59b6652f844ba6293d48316faab1d',
            hosted_failure_head='222f2e80ecf6ac485382cc01f70b96a84476862a',
            hosted_job=132215554368, hosted_failure_line=811,
            actual_parent_failure=True, focused_node=18,
            native_held_frame_moves=6, independent_mcp_moves=4,
            hosted_scheduling_trigger_proven=False,
            checkout_delay_explained=False, deadlines_increased=False,
            issue_complete=False, exact_head_ci_required=True),
       'issue-56-directory-focus/*.png',
       before={name: '1ea671cf' for name in [
           'js/src/web/chat-list-window.js',
           'js/tests/e2e-chat-responsiveness-browser.mjs',
       ]})
