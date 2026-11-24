"""Preserve real native unread option and held-draft coverage without acceptance."""
from pathlib import Path
import json
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
names = [
    'js/tests/helpers/unread-native-fixture.mjs',
    'js/tests/helpers/e2e-unread-answers.mjs',
    'js/tests/helpers/e2e-unread-bot-choices.mjs',
    'js/tests/e2e-question-unread-choices-browser.mjs',
    'js/tests/ci-contracts.test.js',
    'js/scripts/browser-checks.json',
    'package.json',
    'js/src/automation/question-unread-answers.js',
    'js/src/automation/question-unread-polling.js',
    'experiments/issue-56/unread-bot-choice-fixture.mjs',
    'experiments/issue-56/unread-bot-choices.mjs',
    'experiments/issue-56/collect-unread-native-options.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/unread-native-options.md',
    'docs/screenshots/issue-56-unread-bot-choices/native-choice-and-held-draft.png',
    'ci-logs/unread-bot-choices-native-initial.log',
    'ci-logs/unread-bot-choices-native.log',
    'ci-logs/unread-bot-choices-contract.log',
]
entries = {name: (root / name).read_bytes() for name in names}
native = [json.loads(line.split('] ', 1)[1])
          for line in entries[names[-2]].decode().splitlines()
          if line.startswith('[browser-scenario] ')]
receipt = next(row for row in native if row.get('phase') == 'passed')
assert receipt['scenario'] == 'verifyUnreadBotChoices'
assert receipt['result'] == dict(nativeChoices=1, textSends=0, heldChat='9',
                                ownerDraftPreserved=True, liveProvider=False)
initial = entries[names[-3]].decode()
assert 'verifyUnreadAnswers' in initial and '"cases":3' in initial
contract = entries[names[-1]].decode()
assert 'pass 1' in contract and 'fail 0' in contract
entries['metadata.json'] = (json.dumps(dict(
    acceptance=False, productionChanged=False, liveProvider=False,
    nativeReceipt=receipt, priorOrdinaryCases=3, hostedResult='pending',
), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/unread-native-options.tar.gz', entries)
