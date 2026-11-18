"""Preserve actual-parent and shared owner search-URL regression evidence."""
import base64
import hashlib
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
parent = '406e8bdf'
paths = [
    'js/src/jobs/search-url.js', 'js/src/jobs/options.js',
    'js/src/jobs/search-result.js', 'js/src/jobs/discovery-data.js',
    'js/src/jobs/salary-ladder.js', 'js/src/jobs/service.js',
    'js/src/web/vacancy-search-input.js', 'js/src/web/vacancies-panel.js',
    'js/src/web/app.min.js', 'js/src/cli/help.js',
    'js/src/cli/vacancy-commands.js', 'js/src/server/routes-vacancies.js',
    'js/tests/vacancy-search-url.test.js',
    'js/tests/vacancy-search-url-controls.test.js',
    'js/tests/e2e-vacancies-browser.mjs',
    'js/tests/helpers/e2e-vacancy-search-url.mjs',
    'experiments/issue-56/vacancy-search-url-before.py',
    'experiments/issue-56/vacancy-search-url-native.mjs',
    'experiments/issue-56/vacancy-browser-fixture.mjs',
    'experiments/issue-56/vacancy-mcp-server.mjs',
    'experiments/issue-56/collect-vacancy-search-url.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/vacancy-search-url.md',
    *[f'js/src/web/locales/{locale}-vacancy.js' for locale in ['en', 'ru', 'zh', 'hi']],
    *[f'docs/screenshots/issue-56-vacancy-search-url/{name}.png'
      for name in ['before', 'after', 'phone']],
]
logs = [f'ci-logs/vacancy-search-url-{name}.log' for name in [
    'before', 'parent', 'before-native', 'parent-native', 'node', 'deno',
    'compatibility', 'native', 'mcp', 'mcp-server', 'mcp-console',
    'build', 'lint', 'format-check', 'secrets', 'diff',
]]
read = lambda name: (root / f'ci-logs/vacancy-search-url-{name}.log').read_text()
assert all(s in read('before') for s in ['tests 6', 'pass 1', 'fail 5'])
assert 'Owner search URL control must exist' in read('before-native')
assert all(s in read('node') for s in ['tests 10', 'pass 10', 'fail 0'])
assert '10 passed | 0 failed' in read('deno')
assert all(s in read('compatibility') for s in ['tests 34', 'pass 34', 'fail 0'])
receipt = json.loads(read('native'))
assert receipt == dict(searches=2, repeatedFilters=True, exactNextPage=True,
    selectedResume='chosen', cachedSettings=True, providerClicks=0,
    pageErrors=0, liveProvider=False)
inspection = json.loads(read('mcp'))
result = json.loads(inspection[-1]['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert result['reloadWithoutReplay'] and result['phoneFits'] and result['invalidUrlDisabled']
assert [entry['locale'] for entry in result['labels']] == ['ru', 'zh', 'hi', 'en']
closed_path = 'ci-logs/vacancy-search-url-mcp-cleanup.json'
closed = json.loads((root / closed_path).read_text())
assert closed['closed'] and closed['resourcesClosed'] and closed['processExited']
assert closed['opens'] == 2 and closed['providerClicks'] == 0
assert not closed['liveProvider'] and closed['pageErrors'] == []
for name in ['lint', 'secrets', 'diff']:
    assert not read(name).strip(), name
assert 'All matched files use Prettier code style!' in read('format-check')
entries = {name: (root / name).read_bytes() for name in [*paths, *logs, closed_path]}
reference_path = 'ci-logs/vacancy-search-url-reference.json'
reference = json.loads((root / reference_path).read_text())
content = base64.b64decode(reference['content'])
assert hashlib.sha1(f'blob {len(content)}\0'.encode() + content).hexdigest() == reference['sha']
assert 'fa0991b8c2d0896fb3b4be6c69947f0590094b15' in reference['html_url']
entries[reference_path] = (root / reference_path).read_bytes()
entries['references/README.md'] = content
for name in ['js/src/jobs/options.js', 'js/src/jobs/discovery-data.js',
             'js/src/jobs/search-result.js', 'js/src/web/vacancies-panel.js']:
    entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent, parentFailures=5,
    parentControls=1, focusedChecks={'node': 10, 'deno': 10, 'compatibility': 34},
    nativeReceipt=receipt, localFullSuite=False, liveProvider=False,
    mcpCleanConsole=False, exactSourceHostedVerificationRequired=True,
    acceptedInventoryRows=[], issueComplete=False), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/vacancy-search-url.tar.gz', entries)
