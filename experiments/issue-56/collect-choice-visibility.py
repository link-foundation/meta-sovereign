"""Verify focused outcomes and preserve actual-parent/native visibility evidence."""
import json
from pathlib import Path
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
read = lambda name: (root / f'ci-logs/choice-visibility-{name}.log').read_text()
assert read('before').count('[choice-visibility] FAIL') == 2
assert read('before').count('[choice-visibility] PASS') == 9
assert '"cases":11,"nativeClicks":11,"textSends":0' in read('after')
assert 'pass 6' in read('node') and 'fail 0' in read('node')
assert '"cases":20,"apiTextWrites":0' in read('existing-browser')
assert not read('lint') and not read('secrets')
assert '6.49%' in read('duplication') and 'ERROR' not in read('duplication')
mcp = json.loads((root / 'ci-logs/choice-visibility-mcp.json').read_text())
result = mcp['content'][0]['text'].split('### Result\n', 1)[1].split('\n###', 1)[0]
result = json.loads(result)
assert not result['pageErrors']
assert [r['after']['scrollTop'] for r in result['results']] == [921, -921]
assert all(r['confirmed']['sent'] and r['after']['visible']
           and r['after']['clicks'] == 1 and r['after']['textSends'] == 0
           for r in result['results'])
assert result['owner']['receipt']['sent'] and not result['owner']['state']['visible']
assert result['owner']['state']['draft'] == 'Owner reply remains mine'
parent = 'c35f813d507dbff50a2d094ebe12177b01304020'
bundle(root, [
    *changed_sources(root), *evidence_logs(root, 'choice-visibility'),
    'experiments/issue-56/provider-choices-mcp-server.mjs',
    'experiments/issue-56/provider-choice-fixture.mjs',
], 'docs/case-studies/issue-56/data/choice-visibility.tar.gz', {
    'parent': parent, 'before_failures': 2, 'before_guards_pass': 9,
    'production_browser_cases': 11, 'native_clicks': 11, 'text_sends': 0,
    'existing_browser_cases': 20, 'node': 6, 'mcp': result,
    'remaining': 'Exact-head CI, guarded free-text/unread workflows and all unchecked issue criteria.',
}, 'issue-56-choice-visibility/mcp-*.png', before={
    'js/src/sources/browser-choice-controller.js': parent,
    'js/src/sources/browser-choices.js': parent,
})
