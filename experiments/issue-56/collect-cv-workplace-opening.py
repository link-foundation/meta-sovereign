"""Retain exact-parent failure and bounded native workplace-opening evidence."""
import hashlib
import json
import subprocess
from evidence_bundle import changed_sources, evidence_context, evidence_logs, verify_evidence, write_entries_archive

root, logs, read = evidence_context(__file__, 'cv-workplace-open')
parent = subprocess.check_output(['git', 'rev-parse', '0e508814'], cwd=root).decode().strip()
verify_evidence(read, {
    'final': ['tests 44', 'pass 44', 'fail 0'],
    'browser-parent': ['The reviewed older workplace must open from the complete native list'],
    'browser-final': ['"cases":3', '"attached":6', '"detached":6', '"saves":0', '"readbacks":1', '[e2e-cv-workplace-open] OK (chromium)'],
    'browser-compat': ['"cases":4', '"cases":6', '[e2e-cv-workplace-open-compat] OK (chromium)'],
}, empty=('lint', 'diff'))
result = json.loads((logs / 'cv-workplace-open-mcp-final.json').read_text())
assert not result.get('isError')
summary = json.loads(result['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert summary == dict(prepared=True, posts=1, overflow=False, reloaded=True, providerSaved=False)
server = [json.loads(line) for line in read('mcp-server-final').splitlines()]
assert server[-1] == {'closed': True}
native = server[-2]
assert native['attached'] == native['detached'] == native['reads'] == 1
assert native['clicks'] == '1' and native['providerSaves'] == native['providerCancels'] == native['saves'] == 0
sources = [p for p in changed_sources(root) if not p.endswith(('.min.js', '.png'))]
entries = {p: (root / p).read_bytes() for p in sources}
for name in ['js/src/jobs/cv-prepare-workplace.js', 'js/src/jobs/cv-workplace-edit-native.js']:
    entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
for name in evidence_logs(root, 'cv-workplace-open'):
    entries[name] = (root / name).read_bytes()
entries['metadata.json'] = (json.dumps({
    'parent': parent, 'newPortableChecks': 10, 'focusedChecks': 44,
    'newNativeScenarios': 3, 'nativeCompatibilityScenarios': 10,
    'hostedVerification': 'required on published correction',
    'criterionAccepted': False, 'originalIssueComplete': False, 'liveProvider': False,
    'screenshots': {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in (root / 'docs/screenshots/issue-56-cv-workplace-open').glob('*.png')},
    'webBundleSha256': hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest(),
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/cv-workplace-opening.tar.gz', entries)
