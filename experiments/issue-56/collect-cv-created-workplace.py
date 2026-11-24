"""Preserve the finite new-record prerequisite without accepting shared copy."""
import json
import subprocess
from evidence_bundle import changed_sources, evidence_context, evidence_logs, write_entries_archive

root, logs, read = evidence_context(__file__, 'cv-created-workplace')
parent = subprocess.check_output(['git', 'rev-parse', 'a50bf56d'], cwd=root).decode().strip()
for name, fragments in {
    'focused': ['pass 32', 'fail 0', 'skipped 0'],
    'parent-replay': ['cycle: expected actual-parent failure 1',
                      'native: expected actual-parent failure 1'],
    'cycle-before': ['pass 5', 'fail 5'],
    'native-before': ['0 !== 1', 'newly saved native workplace'],
    'native-after': ['"createdRecordVerified":true', '"liveProvider":false'],
    'format-check': ['All matched files use Prettier code style!'],
    'limits': ['0 over the 1500 line limit'],
    'doc-limits': ['All documentation files are within'],
}.items():
    assert all(fragment in read(name) for fragment in fragments), name
for name in ['secrets', 'diff']:
    assert not read(name).strip(), name
assert '0 errors, 3 warnings' in read('lint')
receipt = json.loads((logs / 'cv-created-workplace-mcp-final.json').read_text())
receipt = receipt['result']
assert all(receipt[key] for key in ['newIdentityVerified', 'mismatchRetainsSnapshots',
                                   'reloadDoesNotReplay', 'phoneFits'])
assert receipt['locales'] == ['ru', 'hi', 'zh', 'en']
assert receipt['errors'] == [] and receipt['ownerSaves'] == 2
assert receipt['attachments'] == receipt['detached'] == 2
assert receipt['authenticatedProvider'] is False
assert 'ERR_CACHE_WRITE_FAILURE' in read('mcp-console')
assert '404' in read('mcp-console')

names = [*changed_sources(root), *evidence_logs(root, 'cv-created-workplace'),
         'ci-logs/cv-created-workplace-mcp-overlay-diagnostic.png']
for name in ['editor', 'navigation', 'browser']:
    names += [f'ci-logs/hh-workplace-reference-{name}.{suffix}' for suffix in ['json', 'mjs']]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in ['js/src/jobs/cv-save-cycle.js', 'js/src/jobs/cv-watch-export.js',
             'js/src/jobs/cv-watch-runtime.js', 'js/src/jobs/cv-watch-verification.js']:
    entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'implementationParent': parent, 'focusedPassed': 32,
    'parentFailures': 5, 'parentIndependentControls': 5,
    'nativeScenario': 'owner-created workplace identity', 'nativeEngine': 'chromium',
    'mcp': receipt, 'consoleWarningsUnexplained': True,
    'lintErrors': 0, 'lintWarnings': 3, 'liveProviderVerified': False,
    'acceptedCriteria': [], 'remainingOriginalCriteria': 30, 'issueComplete': False,
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/cv-created-workplace.tar.gz', entries)
