"""Retain exact presentation sources and bounded parent/native/MCP evidence."""
import json
import subprocess
from evidence_bundle import changed_sources, evidence_context, evidence_logs, verify_evidence, write_entries_archive

root, logs, read = evidence_context(__file__, 'ui-defaults')
parent = '10a9f1e17f0db6c68e70556331d0d69843be3962'
verify_evidence(read, {
    'before': ['tests 6', 'fail 5'],
    'before-native': ['0 !== 1'],
    'focused': ['pass 48', 'fail 0'],
    'draft-locale': ["'ru' !== 'en'"],
    'draft-phone': ['false !== true'],
    'format-check': ['All matched files use Prettier code style!'],
    'source-limits': ['0 over the 1500 line limit'],
})
native = json.loads(read('native'))
assert native == dict(delayedDefaultsPreservedOwnerChoices=True,
    explicitChoicesSurviveReload=True, resetFollowsConfiguredDefaults=True,
    automaticDayNight=True, languages=4, phoneFits=True,
    runnerCalls=0, pageErrors=0, liveProvider=False)
before = json.loads((logs / 'ui-defaults-mcp-before.json').read_text())
assert before['isError'] and 'TimeoutError' in before['content'][0]['text']
after = json.loads((logs / 'ui-defaults-mcp-after.json').read_text())
receipt = json.loads(after['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert receipt == dict(sharedDefaultsApplied=True, ownerChoicesSurviveReload=True,
    resetRetainedAfterReload=True, locales=4, phoneFits=True, liveProvider=False, errors=[])
for name in ['mcp-server', 'before-mcp-server']:
    assert json.loads(read(name).splitlines()[-1]) == dict(
        applicationResourcesClosed=True, liveProvider=False)
names = changed_sources(root, 'e7fe268f') + evidence_logs(root, 'ui-defaults') + [
    'experiments/issue-56/application_parent_fixture.py',
    'experiments/issue-56/evidence_bundle.py',
    'experiments/issue-56/question-browser-probe.mjs', '.jscpd.json',
]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in names:
    if name.startswith('js/src/') and subprocess.run(
        ['git', 'cat-file', '-e', f'{parent}:{name}'], cwd=root,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        entries[f'before/{name}'] = subprocess.check_output(
            ['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent,
    criterion='partial VD06/VD07; remains unfinished', focusedPass=48,
    parentFailures=5, actualParentNativeFailure=True, actualParentMcpFailure=True,
    liveProvider=False, acceptedCriteria=86, unfinishedCriteria=32,
    issueComplete=False), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ui-defaults.tar.gz', entries)
