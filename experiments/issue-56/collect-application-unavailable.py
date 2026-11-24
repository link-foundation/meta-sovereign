"""Bind the account-refusal change to parent failures and finite verification."""
import json
import subprocess
from evidence_bundle import changed_sources, evidence_context, evidence_logs, verify_evidence, write_entries_archive

root, logs, read = evidence_context(__file__, 'application-unavailable')
parent = '13623bf7d51aed6a0d570c7e6efbabff726d0e87'
verify_evidence(read, {
    'before': ['tests 4', 'fail 4'],
    'before-native': ['0 !== 1'],
    'focused': ['pass 98', 'fail 0'],
    'format-check': ['All matched files use Prettier code style!'],
    'source-limits': ['0 over the 1500 line limit'],
}, empty=('lint-final', 'secrets', 'diff'))
native = json.loads(read('native'))
assert native == dict(ignoredVariants=10, visibleVariants=5, binaryLino=True,
    privateReason=True, manualClear=True, providerSubmissions=0,
    resourcesClosed=True, errors=[])
before = json.loads((logs / 'application-unavailable-mcp-before.json').read_text())
assert before['isError'] and 'vacancy-unavailable' in before['content'][0]['text']
after = json.loads((logs / 'application-unavailable-mcp-after.json').read_text())
receipt = json.loads(after['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert receipt == dict(renderedWarningBlocked=True, collapsedIgnored=True,
    persistedAfterReload=True, clearPersisted=True, ownerAnswersPreserved=True,
    providerSubmissions=0, phoneFits=True, browsersClosed=True, errors=[])
for name in ['mcp-server', 'before-mcp-server']:
    closed = json.loads(read(name).splitlines()[-1])
    assert closed['closed'] and not closed['liveProvider'] and closed['pageErrors'] == []
names = changed_sources(root) + evidence_logs(root, 'application-unavailable') + [
    'experiments/issue-56/application_parent_fixture.py',
    'experiments/issue-56/compose-application-mcp.py',
    'experiments/issue-56/application-mcp-fixture.mjs',
    'experiments/issue-56/evidence_bundle.py', '.jscpd.json',
]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in names:
    if name.startswith('js/src/') and subprocess.run(
        ['git', 'cat-file', '-e', f'{parent}:{name}'], cwd=root,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        entries[f'before/{name}'] = subprocess.check_output(
            ['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent,
    criterion='partial HH05; remains unfinished', focusedPass=98, parentFailures=4,
    actualParentNativeFailure=True, actualParentMcpFailure=True,
    liveProvider=False, providerSubmissions=0, acceptedCriteria=86,
    unfinishedCriteria=32, issueComplete=False), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/application-unavailable.tar.gz', entries)
