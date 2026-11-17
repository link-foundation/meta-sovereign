"""Preserve bounded same-watcher draft-clear and native option receipts."""
from pathlib import Path
import json
from evidence_bundle import write_entries_archive
from hosted_evidence import read_reference_contracts

root = Path(__file__).resolve().parents[2]
names = [
    'js/tests/question-browser-watch.test.js',
    'js/tests/helpers/e2e-question-browser-watch.mjs',
    'js/tests/e2e-question-controls-browser.mjs',
    'js/src/automation/question-watch-cycle.js',
    'js/src/sources/browser-choice-controller.js',
    'experiments/issue-56/question-watch-fixture.mjs',
    'experiments/issue-56/question-watch-ui.mjs',
    'experiments/issue-56/collect-option-clear-retry.py',
    'experiments/issue-56/evidence_bundle.py',
    'experiments/issue-56/hosted_evidence.py',
    'docs/case-studies/issue-56/option-clear-retry.md',
    'ci-logs/question-watch-clear-retry-node.log',
    'ci-logs/question-watch-clear-retry-native.log',
]
entries = {name: (root / name).read_bytes() for name in names}
node = entries[names[-2]].decode()
native = entries[names[-1]].decode()
assert 'pass 17' in node and 'fail 0' in node and 'skipped 0' in node
assert 'PASS editing preserves owner content; clearing the unsent draft retries one native choice' in native
assert json.loads(native.splitlines()[-1]) == dict(cases=5, pageErrors=[], liveProvider=False)
references = read_reference_contracts(root, {
    'salary-option-contract': ['ci-logs/salary-options-reference-readme.json'],
    None: ['ci-logs/qa14-reference-source.json'],
}, entries, 'fa0991b8c2d0896fb3b4be6c69947f0590094b15')
entries['metadata.json'] = (json.dumps(dict(
    acceptance=False, productionChanged=False, focusedTests=17, nativeCases=5,
    referenceContracts=references, liveProvider=False,
    remaining='Complete QA14 mapping, hosted checks and all 40 original criteria',
), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/option-clear-retry.tar.gz', entries)
