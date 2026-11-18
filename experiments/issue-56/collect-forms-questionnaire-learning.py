"""Preserve actual paired-learning failures and bounded browser observations."""
import hashlib
import json
import subprocess
from evidence_bundle import changed_sources, evidence_context, evidence_logs, verify_evidence, write_entries_archive

root, logs, read = evidence_context(__file__, 'forms-questionnaire-learning')
parent = subprocess.check_output(['git', 'rev-parse', '76c56487'], cwd=root).decode().strip()
assert 'fail 3' in read('parent') and 'pass 2' in read('parent')
verify_evidence(read, {
    'final': ['pass 42', 'fail 0'],
    'browser-parent': ['"saved":1', '"closed":true', '[e2e-forms-reader] FAIL'],
    'browser-final': ['"saved":3', '"skipped":0', '"submissions":1',
                      '"sessions":1', '"closed":true', '"overflow":false',
                      '[e2e-forms-reader] OK (chromium)'],
}, empty=('lint', 'diff'))
result = json.loads((logs / 'forms-questionnaire-learning-mcp-final.json').read_text())
assert not result.get('isError')
summary = json.loads(result['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert summary['phase'] == 'learned' and summary['closed'] and summary['reloaded']
assert summary['overflow'] is False and '3 proposals saved · 0 skipped' in summary['journal']
closed = json.loads(read('mcp-server-final').splitlines()[-1])
assert closed['submissions'] == 1 and len(closed['reads']) == 1
assert all(entry['closed'] for entry in closed['reads'])
assert len([entry for entry in closed['requests'] if entry['method'] == 'POST']) == 1
names = [name for name in changed_sources(root) if not name.endswith(('.min.js', '.png'))]
entries = {name: (root / name).read_bytes() for name in names}
for name in ['js/src/automation/question-learning.js', 'js/src/forms/answer-learning.js']:
    entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
for name in evidence_logs(root, 'forms-questionnaire-learning'):
    entries[name] = (root / name).read_bytes()
entries['metadata.json'] = (json.dumps({
    'parent': parent, 'newPortableChecks': 5, 'focusedChecks': 42,
    'parentFailures': 3, 'localBrowser': 'focused Chromium only',
    'hostedVerification': 'required on published correction',
    'criterionAccepted': False, 'originalIssueComplete': False, 'liveProvider': False,
    'screenshots': {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in (root / 'docs/screenshots').glob('issue-56-forms-questionnaire-learning-*.png')},
    'webBundleSha256': hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest(),
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/forms-questionnaire-learning.tar.gz', entries)
