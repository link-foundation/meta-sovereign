"""Retain actual parent loss, native/browser controls and drained fixture evidence."""
import hashlib
import json
import subprocess
from evidence_bundle import changed_sources, evidence_context, evidence_logs, verify_evidence, write_entries_archive

root, logs, read = evidence_context(__file__, 'application-answer-context')
parent = subprocess.check_output(['git', 'rev-parse', 'e940cb62'], cwd=root).decode().strip()
assert 'fail 6' in read('parent') and 'pass 0' in read('parent')
verify_evidence(read, {
    'final': ['pass 32', 'fail 0'],
    'compatibility': ['pass 52', 'fail 0'],
    'browser-final': ['[e2e-application-answer-context] OK (chromium)',
                      '"automaticWrites":0', '"automaticSubmissions":0',
                      '"reviewedSubmissions":1', '"ownedBrowserClosed":true'],
}, empty=('lint', 'diff'))
for phase in ['before', 'after']:
    result = json.loads((logs / f'application-answer-context-mcp-{phase}.json').read_text())
    assert not result.get('isError')
    summary = json.loads(result['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
    assert summary['phase'] == phase and summary['errors'] == []
    assert summary['answerContextControls'] == (phase == 'after')
    if phase == 'after':
        assert summary['phoneOverflow'] is False and summary['nativeReviewClosed']
closed = json.loads(read('mcp-server').splitlines()[-1])
assert closed == {'opens': 4, 'closed': True, 'providerClicks': 0,
                  'pageErrors': [], 'liveProvider': False}
names = [name for name in changed_sources(root)
         if not name.endswith(('.min.js', '.png'))]
entries = {name: (root / name).read_bytes() for name in names}
for name in names:
    if name.startswith('js/src/') and subprocess.run(
            ['git', 'cat-file', '-e', f'{parent}:{name}'], cwd=root,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
for name in evidence_logs(root, 'application-answer-context'):
    entries[name] = (root / name).read_bytes()
entries['metadata.json'] = (json.dumps({
    'parent': parent, 'portableChecks': {'new': 11, 'focusedFinal': 32, 'compatibility': 52},
    'localBrowser': 'focused Chromium only', 'hostedVerification': 'required on published correction',
    'liveProvider': False, 'criterionAccepted': False, 'originalIssueComplete': False,
    'screenshots': {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in (root / 'docs/screenshots').glob('issue-56-application-context-*.png')},
    'webBundleSha256': hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest(),
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/application-answer-context.tar.gz', entries)
