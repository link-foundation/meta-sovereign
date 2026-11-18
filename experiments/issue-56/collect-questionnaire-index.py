"""Archive actual saved-questionnaire regressions and finite browser evidence."""
import hashlib
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
parent = subprocess.check_output(['git', 'rev-parse', '9c9baf5d'], cwd=root).decode().strip()
assert 'fail 3' in (logs / 'questionnaire-index-parent.log').read_text()
assert 'pass 20' in (logs / 'questionnaire-index-node.log').read_text()
assert 'fail 0' in (logs / 'questionnaire-index-node.log').read_text()
assert 'pass 9' in (logs / 'questionnaire-index-final-node.log').read_text()
assert 'fail 0' in (logs / 'questionnaire-index-final-node.log').read_text()
assert not (logs / 'questionnaire-index-final-lint.log').read_text().strip()
browser = (logs / 'questionnaire-index-browser.log').read_text()
assert '[e2e-questions] OK (chromium)' in browser
assert '"savedOnlyCount":0' in browser and '"providerWrites":0' in browser
for phase in ['before', 'after']:
    response = json.loads((logs / f'questionnaire-index-mcp-{phase}.json').read_text())
    result = json.loads(response['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
    assert result['indexed'] is (phase == 'after') and result['errors'] == []
    assert result['liveProvider'] is False
    if phase == 'after':
        assert result['overflow'] is False and 'Review required' in result['text']
        assert 'Observed answer turns: 0' in result['text']
    closed = json.loads((logs / f'questionnaire-index-mcp-{phase}-server.log').read_text().splitlines()[-1])
    assert closed == {'resourcesClosed': True, 'liveProvider': False}

names = [
    'js/src/automation/answer-key-hash.js',
    'js/src/automation/questionnaire-index.js',
    'js/src/automation/questionnaire-backfill.js',
    'js/src/automation/question-answers.js',
    'js/src/automation/question-learning.js',
    'js/src/automation/question-store.js',
    'js/src/cli/help.js', 'js/src/cli/question-commands.js',
    'js/src/server/routes-question-answers.js',
    'js/src/web/locales/en.js', 'js/src/web/locales/ru-questions.js',
    'js/src/web/locales/zh.js', 'js/src/web/locales/hi.js',
    'js/tests/questionnaire-index.test.js',
    'js/tests/helpers/e2e-questionnaire-index.mjs',
    'js/tests/e2e-questions-browser.mjs',
    'experiments/issue-56/collect-questionnaire-index.py',
    'experiments/issue-56/evidence_bundle.py',
    'experiments/issue-56/questionnaire-index-plan.md',
    'experiments/issue-56/questionnaire-index-fixture.mjs',
    'experiments/issue-56/questionnaire-index-before-loader.mjs',
    'experiments/issue-56/questionnaire-index-mcp-server.mjs',
    'experiments/issue-56/questionnaire-index-mcp.mjs',
    'docs/case-studies/issue-56/questionnaire-index.md',
    *[f'docs/QUESTIONNAIRES{suffix}.md' for suffix in ['', '.ru', '.zh', '.hi']],
]
entries = {name: (root / name).read_bytes() for name in names}
for path in sorted(logs.glob('questionnaire-index-*')):
    if path.is_file() and path.suffix in ['.log', '.json', '.js'] and not path.name.endswith(('-commit.log', '-archive.log', '-push.log')):
        entries[str(path.relative_to(root))] = path.read_bytes()
for name in ['question-answers', 'question-store']:
    path = f'js/src/automation/{name}.js'
    data = subprocess.check_output(['git', 'show', f'{parent}:{path}'], cwd=root)
    assert data == (logs / f'questionnaire-index-parent-{name}.js').read_bytes()
    entries[f'before/{path}'] = data
entries['metadata.json'] = (json.dumps({
    'parent': parent, 'initialFocusedChecks': 20, 'finalFocusedChecks': 9,
    'localBrowser': 'focused Chromium only', 'liveProvider': False,
    'criterionAccepted': False, 'originalIssueComplete': False,
    'hostedVerification': 'required for the published correction',
    'sourceHashes': {name: hashlib.sha256(entries[name]).hexdigest() for name in names},
    'screenshots': {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                    for path in (root / 'docs/screenshots').glob('issue-56-questionnaire-index-*.png')},
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/questionnaire-index.tar.gz', entries)
