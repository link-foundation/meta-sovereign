"""Preserve finite question-policy regressions and source-bound browser evidence."""
import json
import subprocess
from pathlib import Path
from evidence_bundle import changed_sources, evidence_logs, write_entries_archive, verify_evidence

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
prefix = 'deferred-questions'
read = lambda name: (logs / f'{prefix}-{name}.log').read_text()
verify_evidence(read, {
    'before': ['fail 2', 'is not a function'],
    'before-native': ['[data-deferred-questions]', 'Timeout 10000ms exceeded'],
    'final-tests': ['tests 110', 'pass 110', 'fail 0'],
}, empty=('lint-final', 'secrets', 'diff'))
native = json.loads(read('browser-final').splitlines()[-1])
assert native == {
    'durableQuestions': 1, 'associatedVacancies': 1, 'actualLetterPreserved': True,
    'queueEntries': 0, 'submissions': 0, 'widths': [1180, 390], 'browserOpens': 1,
    'ownedBrowsersClosed': True, 'pageErrors': [], 'liveProvider': False,
}
mcp = json.loads((logs / f'{prefix}-mcp-final.json').read_text())
receipt = json.loads(mcp['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert receipt['saved']['entries'] == 1
assert 'A private question <do not interpret>' in receipt['saved']['literal']
assert receipt['removed'] and receipt['exceptions'] == [] and not receipt['liveProvider']
assert [item['locale'] for item in receipt['locales']] == ['en', 'ru', 'hi', 'zh']
assert all(item['locale'] == item['lang'] and not item['overflow'] and not item['alerts']
           for item in receipt['locales'])
assert json.loads(read('mcp-final-server').splitlines()[-1]) == {
    'opens': 0, 'closed': True, 'providerClicks': 0, 'pageErrors': [], 'liveProvider': False,
}
names = changed_sources(root)
names += evidence_logs(root, prefix)
names += ['ci-logs/hh05-reference-deferred-questions.mjs',
          'ci-logs/hh05-reference-deferred-questions.mjs.json',
          'ci-logs/application-reference-head.json',
          'experiments/issue-56/evidence_bundle.py',
          'experiments/issue-56/application_parent_fixture.py',
          'experiments/issue-56/question-browser-probe.mjs']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
parent = '4363ddd95d2fb9b9c74ee0cdf0a785a30afc4bc3'
for name in names:
    if not name.startswith('js/src/'):
        continue
    result = subprocess.run(['git', 'show', f'{parent}:{name}'], cwd=root,
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    if result.returncode == 0:
        entries[f'before/{name}'] = result.stdout
entries['metadata.json'] = (json.dumps({
    'parent': parent, 'unit': 'durable HH question deferrals',
    'focusedTests': 110, 'liveProvider': False, 'criteriaAccepted': [],
    'inventoryVerified': 88, 'inventoryUnfinished': 30,
    'pinnedReference': 'fa0991b8c2d0896fb3b4be6c69947f0590094b15',
    'verification': 'Local finite evidence; exact-source hosted verification remains required.',
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/deferred-questions.tar.gz', entries)
