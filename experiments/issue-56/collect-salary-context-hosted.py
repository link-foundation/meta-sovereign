"""Bind QA12's complete mapping to current-source portable and native receipts.

Preserve all five workflow responses and Node plus browser shard 2/3 logs as
hosted-verification-SLUG-*.json and hosted-SLUG-TAG.log. Run the catalog source
audit at the same published SHA first. Integrity alone never accepts a criterion.
"""
import json
from pathlib import Path
import subprocess
import sys
from evidence_bundle import write_entries_archive
from hosted_evidence import (
    read_workflows, read_jobs, source_reader, read_catalog_audit, read_literal_tests,
    read_reference_contracts,
)

root = Path(__file__).resolve().parents[2]
revision, slug = sys.argv[1:]
sha = subprocess.check_output(['git', 'rev-parse', revision], cwd=root).decode().strip()
entries = {}
runs = read_workflows(root, sha, slug, entries)
selected = {'node': ('Checks and release', 'Test (node on ubuntu-26.04)')}
for engine in ['chromium', 'webkit']:
    for shard in [2, 3]:
        selected[f'{engine}-{shard}'] = (
            'Checks and release', f'Browser e2e ({engine}, shard {shard}/4)')
raw, jobs = read_jobs(root, runs, slug, selected, entries)
source = source_reader(root, sha, entries)
catalog_path = 'experiments/issue-56/salary-context-evidence.json'
catalog = json.loads((root / catalog_path).read_text())
read_catalog_audit(root, sha, 'salary-context-criteria', catalog, source, entries)
stems = set(catalog) - {'salary-phrasing', 'salary-numbers'}
stems.update(f'{stem}-controls' for stem in [
    'question-salary', 'salary-calculation', 'salary-both', 'question-substitution',
])
tests = read_literal_tests(stems, source, raw['node'])
assert sum(map(len, tests.values())) == 120

registration = json.loads(source('js/scripts/browser-checks.json'))
assert registration.index('question-controls') % 4 == 1
assert registration.index('questions') % 4 == 2
runner = source('js/scripts/run-browser-checks.mjs')
assert 'timeout: 180_000' in runner
control_entry = source('js/tests/e2e-question-controls-browser.mjs')
clarification = source('js/tests/helpers/e2e-salary-clarification.mjs')
helpers = ['Clarification', 'Wording', 'Vocabulary', 'Intent',
           'TemplateContext', 'ContextPriority']
for name in helpers:
    assert f'                    verifySalary{name},' in control_entry
for name in ['Phrasing', 'Numbers', 'BrowserContext', 'BrowserVacancy',
             'BrowserVacancyCard', 'EmployerContext']:
    assert f'await verifySalary{name}(browser);' in clarification
question_entry = source('js/tests/e2e-questions-browser.mjs')
assert 'await verifySalaryBoth(' in question_entry
assert 'await verifyQuestionSubstitution(' in question_entry
for stem in ['clarification', 'wording', 'vocabulary', 'intent', 'template-context',
             'context-priority', 'browser-context', 'browser-vacancy',
             'browser-vacancy-card', 'employer-context', 'both', 'exchange',
             'exchange-policy']:
    source(f'js/tests/helpers/e2e-salary-{stem}.mjs')
source('js/tests/helpers/e2e-question-substitution.mjs')
source('js/tests/helpers/salary-draft-browser.mjs')

drafts = {
    'salary-clarification': ('От $7 100 в месяц до вычета налогов.', 'USD', 'gross'),
    'salary-clarification-phrasing': ('From $7 100 gross per month.', 'USD', 'gross'),
    'salary-clarification-numbers': ('From $7 100 gross per month.', 'USD', 'gross'),
    'salary-browser-context': ('From $7 100 gross per month.', 'USD', 'gross'),
    'salary-browser-vacancy': ('From $6 000 net per month.', 'USD', 'net'),
    'salary-browser-vacancy-card': ('From 5 500 € net per month.', 'EUR', 'net'),
    'salary-employer-context': ('From 5 500 € net per month.', 'EUR', 'net'),
    'salary-wording': ('От 5 500 € ежемесячно на руки.', 'EUR', 'net'),
    'salary-vocabulary': ('From 6 500 € gross per month.', 'EUR', 'gross'),
    'salary-intent': ('От 6 500 € в месяц до вычета налогов.', 'EUR', 'gross'),
    'salary-template-context': ('I expect 5 500 €, negotiable.', 'EUR', 'net'),
    'salary-context-priority': ('From 6 200 USDT net per month.', 'USDT', 'net'),
}
expected = {
    marker: dict(draft=text, currency=currency, basis=basis, textSends=0,
                 ownerDraftPreserved=True, rulesPreserved=True)
    for marker, (text, currency, basis) in drafts.items()
}
for marker, reads in [('salary-browser-vacancy', 1), ('salary-browser-vacancy-card', 0)]:
    expected[marker].update(reads=reads, resourcesClosed=True, liveProvider=False)
expected['salary-browser-context-guard'] = dict(refused=True, textSends=0, draft='')
expected['salary-priority-controls'] = dict(
    contextPriority=10, tiedPriorityRequiresReview=True, narrowLayout=True, textSends=0)
receipts = {}
for engine in ['chromium', 'webkit']:
    controls = raw[f'{engine}-2']
    assert any(f'[e2e-question-controls] OK ({engine})' in line for line in controls)
    assert any(f'[e2e-questions] OK ({engine})' in line for line in raw[f'{engine}-3'])
    for name in helpers:
        matches = [json.loads(line.split('[browser-scenario] ', 1)[1])
                   for line in controls if '[browser-scenario] ' in line]
        passed = [value for value in matches if (value['group'], value['scenario'], value['phase'])
                  == ('question-controls', f'verifySalary{name}', 'passed')]
        assert len(passed) == 1, (engine, name)
    for marker, value in expected.items():
        matches = [(i, json.loads(line.split(f'[{marker}] ', 1)[1]))
                   for i, line in enumerate(controls, 1) if f'[{marker}] ' in line]
        assert len(matches) == 1 and matches[0][1] == value, (engine, marker, matches)
        receipts[f'{engine}/{marker}'] = dict(line=matches[0][0], receipt=value)

references = read_reference_contracts(root, {
    'salary-clarification-contract': [
        f'ci-logs/salary-clarification-reference-{name}.json'
        for name in ['chat', 'hourly', 'questions']],
    None: [f'ci-logs/salary-context-reference-{name}.json' for name in ['source', 'tests']],
}, entries, 'fa0991b8c2d0896fb3b4be6c69947f0590094b15')
assert {'tests/salary-questions.test.mjs', 'tests/chat-salary-clarification.test.mjs',
        'tests/hourly-salary.test.mjs', 'tests/answer-contexts.test.mjs',
        'src/answer-contexts.mjs'} <= set(references)
for name in [catalog_path, 'experiments/issue-56/collect-salary-context-hosted.py',
             'experiments/issue-56/hosted_evidence.py',
             'experiments/issue-56/evidence_bundle.py',
             'experiments/issue-56/audit-hosted-criteria.py',
             'docs/case-studies/issue-56/salary-context-criteria-audit.md']:
    entries[name] = (root / name).read_bytes()
entries['metadata.json'] = (json.dumps(dict(
    sha=sha, workflows=5, jobs=jobs, namedTests=tests, browserReceipts=receipts,
    referenceContracts=references,
    criterion='QA12', archivedUnits=len(catalog), liveProvider=False, acceptance=False,
), indent=2) + '\n').encode()
write_entries_archive(root / f'docs/case-studies/issue-56/data/salary-context-hosted-{slug}.tar.gz', entries)
print(f'Verified 120 named salary checks and {len(receipts)} native receipts at {sha}')
