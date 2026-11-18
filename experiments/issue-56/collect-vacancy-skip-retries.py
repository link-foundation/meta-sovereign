"""Preserve bounded native refusal evidence without accepting complete HH05."""
import json
import re
import subprocess
from evidence_bundle import changed_sources, evidence_context, evidence_logs, write_entries_archive

root, logs, read = evidence_context(__file__, 'vacancy-skip-retries')
parent = '9c369eaf45d8d33c2b095924d7f956defef2ee3c'
assert all(text in read('focused') for text in ['pass 73', 'fail 0', 'skipped 0'])
assert 'fail 11' in read('before') and 'pass 3' in read('before')
assert 'disabled native Send must produce' in read('before-native')
assert parent in read('replay')
assert 'All matched files use Prettier code style!' in read('format-check')
assert 'Scoped source and documentation limits pass' in read('limits')
for suffix in ['secrets', 'diff']:
    assert not read(suffix).strip(), suffix
# The constructor warning predates this unit; no new scoped warning is accepted.
warning = 'Constructor has a complexity of 16. Maximum allowed is 15'
assert warning in read('lint-baseline') and warning in read('lint-final')
assert '0 errors, 1 warning' in read('lint-final')
assert 'ERROR:' not in read('duplication')
assert json.loads((root / '.jscpd.json').read_text())['threshold'] == 6.5
native = json.loads(read('native'))
mcp = json.loads((logs / 'vacancy-skip-retries-mcp.json').read_text())
for result in [native, mcp]:
    assert result['nativeDisabledControls'] == 2 and result['sameRunCount'] == 1
    assert result['translatedLocales'] == 4 and result['stableReads']
    assert result['clearPersisted'] and result['submissions'] == 0
assert native['resourcesClosed'] and native['privateAnswerPreserved']
assert mcp['browserClosed'] and mcp['ownerAnswerPreserved'] and mcp['phoneFits']
assert mcp['errors'] == []
server = [json.loads(line) for line in read('mcp-server').splitlines()]
assert server[-1] == {'resourcesClosed': True, 'liveProvider': False}
paths = changed_sources(root)
entries = {name: (root / name).read_bytes() for name in sorted(set([
    *paths, *evidence_logs(root, 'vacancy-skip-retries'),
    '.jscpd.json', 'experiments/issue-56/evidence_bundle.py',
    'ci-logs/hh05-reference-skipped-vacancies.mjs',
]))}
for name in paths:
    if re.match(r'js/(src|tests)/', name):
        exists = subprocess.run(['git', 'cat-file', '-e', f'{parent}:{name}'],
                                cwd=root, capture_output=True).returncode == 0
        if exists:
            entries[f'before/{name}'] = subprocess.check_output(
                ['git', 'show', f'{parent}:{name}'], cwd=root)
for name, content in entries.items():
    if name.endswith('.png'):
        assert content.startswith(b'\x89PNG\r\n\x1a\n'), name
entries['metadata.json'] = (json.dumps({
    'actualParent': parent, 'reference': 'fa0991b8c2d0896fb3b4be6c69947f0590094b15',
    'parentFailures': 11, 'parentControls': 3, 'focusedPassed': 73,
    'nativeAndIndependentMcp': True, 'submissions': 0,
    'localConcurrency': 1, 'nodeHeapMiB': 384,
    'criterion': 'HH05 remains unfinished', 'remainingOriginalCriteria': 30,
    'issueComplete': False, 'exactSourceHostedVerification': 'pending publication',
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/vacancy-skip-retries.tar.gz', entries)
