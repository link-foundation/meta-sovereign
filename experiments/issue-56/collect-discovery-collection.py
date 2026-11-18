"""Preserve exact-parent failures and bounded selected-description regressions."""
import json
import subprocess
from evidence_bundle import (
    changed_sources, evidence_context, evidence_logs, verify_evidence,
    write_entries_archive,
)

root, logs, read = evidence_context(__file__, 'discovery-collection')
verify_evidence(read, {
    'before-node': ['ℹ tests 10', 'ℹ pass 5', 'ℹ fail 5'],
    'focused': ['ℹ tests 32', 'ℹ pass 32', 'ℹ fail 0'],
    'controls': ['ℹ tests 16', 'ℹ pass 16', 'ℹ fail 0'],
    'before-native': ['3 !== 4'],
    'salary-native': ['"resourcesClosed":true', '"providerClicks":0'],
    'format-final': ['All matched files use Prettier code style!'],
})
receipt = json.loads(read('native').splitlines()[0])
assert receipt['excludedTitleCollected'] and receipt['resourcesClosed']
assert receipt['descriptions'] == 2 and receipt['pages'] == 2
assert receipt['providerClicks'] == 0 and not receipt['batchStarted']
assert not receipt['recoveryReplayed'] and receipt['locales'] == 4
names = set(changed_sources(root))
names.update(evidence_logs(root, 'discovery-collection'))
names.update({
    'experiments/issue-56/discovery-fixture.mjs',
    'experiments/issue-56/vacancy-browser-fixture.mjs',
    'experiments/issue-56/question-browser-probe.mjs',
    'experiments/issue-56/evidence_bundle.py',
    'ci-logs/hh-reference-readme.md',
    'ci-logs/hh05-reference-vacancies.mjs',
})
entries = {name: (root / name).read_bytes() for name in sorted(names)}
parent = '9da8b847644b0daf07da6475e6ad9bb2f7d81e3e'
entries['before/js/src/jobs/discovery.js'] = subprocess.check_output(
    ['git', 'show', f'{parent}:js/src/jobs/discovery.js'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'parent': parent, 'receipt': receipt, 'liveProvider': False,
    'acceptedInventoryRows': [], 'issueComplete': False,
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/discovery-collection.tar.gz', entries)
