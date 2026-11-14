"""Retain verified per-step continuation evidence and exact-parent source snapshots."""
import json
import subprocess
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'application-confirmations')
checks = {
    'before': ['independent continuation is absent'],
    'before-native': ['independent confirmation control is absent'],
    'node': ['pass 63', 'fail 0'],
    'deno': ['34 passed | 0 failed'],
    'fixture': ['pass 1', 'fail 0'],
    'fixture-deno': ['1 passed | 0 failed'],
    'native-final': ['"confirmations":3', '"entryClicks":0', '"submissions":1',
                     '"reloadReplayed":false', '"locales":4', '"phone":true',
                     '"resourcesClosed":true', '"errors":[]', 'OK (chromium)'],
    'mcp-server': ['"closed":true', '"pageErrors":[]', '"liveProvider":false'],
    'format-final': ['All matched files use Prettier code style!'],
}
for name, expected in checks.items():
    assert all(fragment in read(name) for fragment in expected), name
for name in ['lint-final', 'secrets-final', 'diff-final']:
    assert not read(name).strip(), name
assert 'Found ' in read('duplication-final') and 'ERROR:' not in read('duplication-final')
mcp = json.loads((logs / 'application-confirmations-mcp-final.json').read_text())
assert not mcp.get('isError')
receipt = '\n'.join(item.get('text', '') for item in mcp['content'])
assert all(fragment in receipt for fragment in [
    '"confirmations":3', '"entries":0', '"sends":1', '"locales":4',
    '"phone":true', '"recoveryReplayed":false', '"resourcesClosed":true', '"errors":[]'])
parent = subprocess.check_output(['git', 'rev-parse', '6ad826b0'], cwd=root, text=True).strip()
sources = changed_sources(root) + evidence_logs(root, 'application-confirmations') + [
    'experiments/issue-56/application_parent_fixture.py',
    'experiments/issue-56/application-native-fixture.mjs',
    'js/src/jobs/application-journal.js', 'js/src/forms/automatic-prefill.js',
    '.github/workflows/release.yml',
]
before = {name: parent for name in sources if name.startswith('js/src/') and
          not name.endswith('app.min.js') and subprocess.run(
              ['git', 'cat-file', '-e', f'{parent}:{name}'], cwd=root,
              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0}
bundle(root, sources, 'docs/case-studies/issue-56/data/application-confirmations.tar.gz',
       dict(parent=parent, focused_node=63, fixture_node=1, focused_deno=34,
            fixture_deno=1, native_confirmations=3, native_sends=1,
            mcp_confirmations=3, mcp_sends=1, entry_clicks=0,
            automatic_recovery_actions=0, locales=4, phone=True,
            remaining_original_inventory_rows=81, issue_complete=False,
            full_batch_and_ram_revisits_required=True, exact_head_ci_required=True),
       'application-confirmations-*.png', before=before)
