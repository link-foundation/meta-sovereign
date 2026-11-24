"""Bind the offered-answer mapping to exact-source portable/native execution."""
from pathlib import Path
import json
import subprocess
import sys
from evidence_bundle import write_entries_archive
from hosted_evidence import (
    read_workflows, read_jobs, source_reader, read_catalog_audit,
    read_literal_tests, read_reference_contracts,
)

root = Path(__file__).resolve().parents[2]
revision, slug = sys.argv[1:]
sha = subprocess.check_output(['git', 'rev-parse', revision], cwd=root).decode().strip()
entries = {}
runs = read_workflows(root, sha, slug, entries)
selected = {'node': ('Checks and release', 'Test (node on ubuntu-26.04)')}
for engine in ['chromium', 'webkit']:
    for shard in [2, 3, 4]:
        selected[f'{engine}-{shard}'] = (
            'Checks and release', f'Browser e2e ({engine}, shard {shard}/4)')
raw, jobs = read_jobs(root, runs, slug, selected, entries)
source = source_reader(root, sha, entries)
catalog_path = 'experiments/issue-56/option-choice-evidence.json'
catalog = json.loads((root / catalog_path).read_text())
read_catalog_audit(root, sha, 'option-choice-criteria', catalog, source, entries)
tests = read_literal_tests([
    'question-strict-options', 'browser-choices', 'question-summary-choice',
    'question-summary-choice-controls', 'question-browser',
    'question-browser-controls', 'question-browser-watch', 'question-watch-planning',
    'question-browser-watch-controls', 'question-unread-answers',
    'question-repeated-answer',
], source, raw['node'])
assert sum(map(len, tests.values())) == 88
registration = json.loads(source('js/scripts/browser-checks.json'))
for stem in ['question-browser-controls', 'question-browser-watch', 'summary-choice',
             'provider-choices', 'hh-choices', 'hh-choice-watch', 'choice-visibility',
             'unread-bot-choices']:
    source(f'js/tests/helpers/e2e-{stem}.mjs')
source('js/tests/helpers/unread-native-fixture.mjs')
source('experiments/issue-56/repeated-question-fixture.mjs')
watcher = source('js/tests/helpers/e2e-question-browser-watch.mjs')
assert 'await verifyRepeatedQuestion(scenario);' in watcher
assert ".fill('')" in watcher
groups = {
    'question-controls': (2, {
        'verifyQuestionBrowserControls': dict(cases=16, pageErrors=[], liveProvider=False),
        'verifySummaryChoices': dict(cases=3, pageErrors=[], liveProvider=False),
        'verifyQuestionBrowserWatch': dict(cases=6, pageErrors=[], liveProvider=False),
    }),
    'question-providers': (4, {
        'verifyProviderChoices': None, 'verifyHhChoices': None,
        'verifyChoiceVisibility': None,
    }),
    'question-unread-choices': (3, {'verifyUnreadBotChoices': None}),
}
receipts = {}
for group, (shard, scenarios) in groups.items():
    assert registration.index(group) % 4 + 1 == shard
    entry = source(f'js/tests/e2e-{group}-browser.mjs')
    for scenario in scenarios:
        assert scenario in entry, (group, scenario)
    for engine in ['chromium', 'webkit']:
        lines = raw[f'{engine}-{shard}']
        assert any(f'[e2e-{group}] OK ({engine})' in line for line in lines)
        for scenario, expected in scenarios.items():
            values = [(i, json.loads(line.split('[browser-scenario] ', 1)[1]))
                      for i, line in enumerate(lines, 1) if '[browser-scenario] ' in line]
            found = [(i, value) for i, value in values if
                     (value['group'], value['scenario'], value['phase']) ==
                     (group, scenario, 'passed')]
            assert len(found) == 1, (engine, scenario)
            line, value = found[0]
            result = value['result']
            if expected is not None:
                assert result == expected, (engine, scenario, result)
            elif scenario == 'verifyUnreadBotChoices':
                assert result == (dict(nativeChoices=1, textSends=0, heldChat='9',
                    ownerDraftPreserved=True, liveProvider=False) if engine == 'chromium'
                    else dict(unsupportedFocusRefused=True, nativeChoices=0,
                              textSends=0, liveProvider=False))
            else:
                assert result['cases'] > 0, result
                if scenario == 'verifyProviderChoices':
                    assert result['apiTextWrites'] == 0
                elif scenario == 'verifyHhChoices':
                    assert result['pageErrors'] == [] and not result['liveProvider']
                else:
                    assert result['textSends'] == 0 and result['nativeClicks'] == result['cases']
            receipts[f'{engine}/{scenario}'] = dict(line=line, receipt=value)
assert 'timeout: 180_000' in source('js/scripts/run-browser-checks.mjs')
references = read_reference_contracts(root, {None: ['ci-logs/qa14-reference-source.json']},
    entries, 'fa0991b8c2d0896fb3b4be6c69947f0590094b15')
for name in [catalog_path, 'experiments/issue-56/collect-option-choice-hosted.py',
             'experiments/issue-56/hosted_evidence.py',
             'experiments/issue-56/evidence_bundle.py',
             'docs/case-studies/issue-56/option-choice-criteria-audit.md']:
    entries[name] = (root / name).read_bytes()
entries['metadata.json'] = (json.dumps(dict(sha=sha, criterion='QA14', jobs=jobs,
    workflows=5, namedTests=tests, browserReceipts=receipts,
    referenceContracts=references, acceptance=False, liveProvider=False), indent=2) + '\n').encode()
write_entries_archive(root / f'docs/case-studies/issue-56/data/option-choice-hosted-{slug}.tar.gz', entries)
