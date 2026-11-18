"""Retain finite owner-composer regressions, native input and phone evidence."""
import json
import subprocess
from evidence_bundle import changed_sources, evidence_context, evidence_logs, write_entries_archive

root, logs, read = evidence_context(__file__, 'browser-composer-draft')
parent = subprocess.check_output(['git', 'rev-parse', '623a144c'], cwd=root).decode().strip()
for name, fragments in {
    'sender-before': ['pass 2', 'fail 21'],
    'native-before': ['Owner draft: review before sendingReviewed', 'AssertionError'],
    'parent-replay': ['sender: expected actual-parent failure', 'native: expected actual-parent failure'],
    'focused': ['pass 118', 'fail 0', 'skipped 0'],
    'native-corrected': ['"cases":6', '"ownerDraftsRetained":3', '"emptyComposerSends":3', '"urlPrefills":0', '"pageErrors":0'],
    'format-check': ['All matched files use Prettier code style!'],
    'limits': ['Scoped source and documentation limits pass'],
}.items():
    assert all(fragment in read(name) for fragment in fragments), name
for name in ['lint', 'secrets', 'diff']:
    assert not read(name).strip(), name
mcp = json.loads((logs / 'browser-composer-draft-mcp.json').read_text())
assert not mcp.get('isError'), mcp
result = json.loads(mcp['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert len(result['cases']) == 2 and result['errors'] == result['consoleMessages'] == []
assert result['liveProvider'] is False and result['fixtureClosed']
assert all(case['existingDraftRetained'] and case['changedDraftRetained']
           and case['phoneFits'] and case['sends'] == 0 for case in result['cases'])
names = [*changed_sources(root), *evidence_logs(root, 'browser-composer-draft'),
         'experiments/issue-56/parent_replay.py', 'experiments/issue-56/evidence_bundle.py']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
entries['before/js/src/sources/browser-sender.js'] = subprocess.check_output(
    ['git', 'show', f'{parent}:js/src/sources/browser-sender.js'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'parent': parent, 'parentFailures': 21, 'parentControls': 2,
    'focusedPassed': 118, 'nativeCases': 6, 'mcpComposerKinds': 2,
    'localConcurrency': 1, 'nodeHeapMiB': 384, 'liveProvider': False,
    'remainingOriginalCriteria': 30, 'issueComplete': False,
    'hostedVerification': 'pending publication',
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/browser-composer-draft.tar.gz', entries)
