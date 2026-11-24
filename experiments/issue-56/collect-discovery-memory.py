"""Preserve the exact-parent retention defect and bounded native recovery."""
import json
import subprocess
from evidence_bundle import (
    changed_sources, evidence_context, evidence_logs, verify_evidence,
    write_entries_archive,
)

root, logs, read = evidence_context(__file__, 'discovery-memory')
verify_evidence(read, {
    'before-node': ['ℹ tests 6', 'ℹ pass 1', 'ℹ fail 5'],
    'focused-final': ['ℹ tests 52', 'ℹ pass 52', 'ℹ fail 0'],
    'before-native': ['Discovery must expose its description-storage setting'],
    'format-final': ['All matched files use Prettier code style!'],
})
receipt = json.loads(read('native-final').splitlines()[0])
assert receipt['memoryOnly'] and receipt['resourcesClosed']
assert receipt['descriptions'] == 2 and receipt['pages'] == 2
assert receipt['providerClicks'] == 0 and not receipt['batchStarted']
assert not receipt['recoveryReplayed'] and receipt['locales'] == 4
mcp = json.loads((logs / 'discovery-memory-mcp.json').read_text())
inspection = json.loads(mcp['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert inspection == dict(memoryOnly=True, locales=4, batchArmed=False,
                         recoveryReplayed=False, errors=[], opens=4,
                         closed=True, clicks=0, savedDescriptions=0,
                         temporaryDescriptions=2, liveProvider=False)
assert json.loads(read('mcp-server').splitlines()[-1]) == dict(
    resourcesClosed=True, liveProvider=False)
names = set(changed_sources(root))
names.update(evidence_logs(root, 'discovery-memory'))
names.update({
    'experiments/issue-56/discovery-fixture.mjs',
    'experiments/issue-56/vacancy-browser-fixture.mjs',
    'experiments/issue-56/question-browser-probe.mjs',
    'experiments/issue-56/application-native-mcp-server.mjs',
    'experiments/issue-56/evidence_bundle.py',
    'js/src/assignments/vacancy-run-context.js',
    'ci-logs/hh-reference-readme.md',
    'ci-logs/hh05-reference-vacancies.mjs',
})
entries = {name: (root / name).read_bytes() for name in sorted(names)}
parent = '5f63c49f74d38e2d9885314c734a764e9dc2f656'
for name in ['assignments/vacancy', 'jobs/discovery-data', 'jobs/discovery', 'jobs/service']:
    path = f'js/src/{name}.js'
    entries[f'before/{path}'] = subprocess.check_output(
        ['git', 'show', f'{parent}:{path}'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'parent': parent, 'receipt': receipt, 'independentInspection': inspection,
    'liveProvider': False, 'acceptedInventoryRows': [], 'issueComplete': False,
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/discovery-memory.tar.gz', entries)
