"""Preserve finite questionnaire regressions and actual browser receipts."""
import hashlib
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert "actual: 'exact'" in (logs / 'form-questionnaire-parent-regression.log').read_text()
assert 'fail 1' in (logs / 'form-questionnaire-parent-regression.log').read_text()
assert 'pass 18' in (logs / 'form-questionnaire-final-node.log').read_text()
assert 'fail 0' in (logs / 'form-questionnaire-final-node.log').read_text()
assert '4 passed | 0 failed' in (logs / 'form-questionnaire-final-deno.log').read_text()
assert '[e2e-forms-reader] OK (chromium)' in (logs / 'form-questionnaire-browser.log').read_text()
assert not (logs / 'form-questionnaire-final-lint-configured.log').read_text().strip()
for phase in ['before', 'after']:
    response = json.loads((logs / f'form-questionnaire-mcp-{phase}.json').read_text())
    result = json.loads(response['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
    assert result['hasSalary'] is (phase == 'after') and result['errors'] == []
    if phase == 'after':
        assert result['phoneOverflow'] is False
    server = 'before' if phase == 'before' else 'after-final'
    closed = json.loads((logs / f'form-questionnaire-mcp-{server}-server.log').read_text().splitlines()[-1])
    assert closed['resourcesClosed'] and closed['submissions'] == 0
    assert all(item['closed'] and not item['events'] for item in closed['reads'])

names = [
    'js/src/forms/answer-plan.js', 'js/src/forms/read-document.js',
    'js/tests/question-assembly-context.test.js',
    'js/tests/helpers/e2e-form-questionnaire.mjs',
    'js/tests/e2e-forms-reader-browser.mjs',
    'experiments/issue-56/form-questionnaire-fixture.mjs',
    'experiments/issue-56/form-questionnaire-before-loader.mjs',
    'experiments/issue-56/form-questionnaire-mcp-server.mjs',
    'experiments/issue-56/form-questionnaire-mcp.mjs',
    'experiments/issue-56/forms-reader-fixture.mjs',
    'experiments/issue-56/collect-question-assembly-context.py',
    'docs/case-studies/issue-56/question-assembly-context.md',
]
entries = {name: (root / name).read_bytes() for name in names}
for path in logs.glob('form-questionnaire-*'):
    if path.is_file() and path.suffix in ['.log', '.json', '.js'] and not path.name.endswith(('-archive.log', '-commit.log', '-push.log')):
        entries[str(path.relative_to(root))] = path.read_bytes()
parent = 'cb95c654941061b70559ca2eb80c822a4244fd20'
for name in ['js/src/forms/answer-plan.js', 'js/src/forms/read-document.js']:
    entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'parent': parent, 'node': 18, 'deno': 4,
    'localBrowser': 'focused Chromium only',
    'hostedVerification': 'required for the new revision',
    'originalIssueComplete': False, 'criterionAccepted': False,
    'liveProvider': False,
    'sources': {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in names},
    'screenshots': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (root / 'docs/screenshots').glob('issue-56-form-questionnaire-*.png')},
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/question-assembly-context.tar.gz', entries)
