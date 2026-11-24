"""Bind current salary-target review to named tests and real native receipts."""
import json
import subprocess
import sys
from pathlib import Path
from evidence_bundle import write_entries_archive
from hosted_evidence import read_workflows, read_jobs, source_reader
from hosted_evidence import read_catalog_audit, read_literal_tests, read_reference_contracts

root = Path(__file__).resolve().parents[2]
revision, slug = sys.argv[1:]
sha = subprocess.check_output(['git', 'rev-parse', revision], cwd=root).decode().strip()
entries = {}
runs = read_workflows(root, sha, slug, entries)
source = source_reader(root, sha, entries)
registry = json.loads(source('js/scripts/browser-checks.json'))
groups = {name: registry.index(name) % 4 + 1
          for name in ['questions', 'forms-answers', 'question-salary-options']}
selected = {'node': ('Checks and release', 'Test (node on ubuntu-26.04)')}
for engine in ['chromium', 'webkit']:
    for shard in set(groups.values()):
        selected[f'{engine}-{shard}'] = (
            'Checks and release', f'Browser e2e ({engine}, shard {shard}/4)')
raw, jobs = read_jobs(root, runs, slug, selected, entries)
catalog_path = 'experiments/issue-56/salary-targets-evidence.json'
catalog = json.loads((root / catalog_path).read_text())
read_catalog_audit(root, sha, 'salary-targets-criteria', catalog, source, entries)
stems = set(catalog)
stems.update(stem + '-controls' for stem in [
    'question-salary', 'salary-calculation', 'salary-exchange', 'salary-both',
    'question-substitution'])
stems.update(['salary-band-safety', 'salary-saved-baseline',
              'salary-nearest-bases', 'salary-range-syntax'])
tests = read_literal_tests(stems, source, raw['node'])
assert sum(map(len, tests.values())) == 94
question_entry = source('js/tests/e2e-questions-browser.mjs')
for method in ['verifySalaryCalculation', 'verifySalaryExchange',
               'verifySalaryExchangePolicy', 'verifySalaryBoth',
               'verifyQuestionSubstitution', 'verifySalary']:
    assert 'await ' + method + '(' in question_entry
for stem in ['exchange', 'exchange-policy', 'both', 'band-saved', 'band-safety']:
    source('js/tests/helpers/e2e-salary-' + stem + '.mjs')
for path in ['js/tests/helpers/e2e-question-substitution.mjs',
             'js/tests/helpers/e2e-form-pay.mjs',
             'experiments/issue-56/forms-pay-fixture.mjs']:
    source(path)
form_entry = source('js/tests/e2e-forms-reader-browser.mjs')
assert '    verifyFormPayUi,' in form_entry
assert '    await verify({' in form_entry
band_entry = source('js/tests/e2e-question-salary-options-browser.mjs')
assert '  verifySalaryBandSaved,' in band_entry
assert '  verifySalaryBandSafety,' in band_entry
runner = source('js/scripts/run-browser-checks.mjs')
assert 'timeout: 180_000' in runner and 'FORMS_GROUP:' in runner
receipts = {}
for engine in ['chromium', 'webkit']:
    for group, shard in groups.items():
        marker = 'forms-reader' if group == 'forms-answers' else group
        assert any(f'[e2e-{marker}] OK ({engine})' in line
                   for line in raw[f'{engine}-{shard}'])
    forms = raw[f'{engine}-{groups["forms-answers"]}']
    matches = [(i, json.loads(line.split('[forms-pay] ', 1)[1]))
               for i, line in enumerate(forms, 1) if '[forms-pay] ' in line]
    assert len(matches) == 1
    line, pay = matches[0]
    assert pay == dict(values=dict(hourly=(
        'Минимум — 2 000 ₽ в час на руки. Комфортная ставка — 2 700 ₽ в час на руки.'),
        monthly='', ownerPay='Owner keeps this pay answer', technical=''),
        receipts=1, closed=True, submits=0), pay
    receipts[engine + '/pay'] = dict(line=line, value=pay)
    band_lines = raw[f'{engine}-{groups["question-salary-options"]}']
    scenarios = [json.loads(line.split('[browser-scenario] ', 1)[1])
                 for line in band_lines if '[browser-scenario] ' in line]
    for scenario, cases in [('verifySalaryBandSaved', 1), ('verifySalaryBandSafety', 3)]:
        found = [v for v in scenarios if (v['group'], v['scenario'], v['phase']) ==
                 ('question-salary-options', scenario, 'passed')]
        assert len(found) == 1
        value = found[0]['result']
        assert value['cases'] == cases and value['nativeReceipts'] == 1
        assert value['pageErrors'] == [] and value['liveProvider'] is False
        assert value['before'] is False and value['textSends'] == 0
        if cases == 3:
            assert value['blockedClicks'] == 0
        receipts[engine + '/' + scenario] = found[0]
references = read_reference_contracts(root, {
    None: [f'ci-logs/salary-current-targets-reference-{name}.json'
           for name in ['readme', 'forms']],
    'salary-clarification-contract': ['ci-logs/salary-clarification-reference-hourly.json'],
}, entries, 'fa0991b8c2d0896fb3b4be6c69947f0590094b15')
for name in [catalog_path, 'experiments/issue-56/collect-salary-targets-hosted.py',
             'experiments/issue-56/hosted_evidence.py',
             'experiments/issue-56/evidence_bundle.py',
             'docs/case-studies/issue-56/salary-targets-criteria-audit.md']:
    entries[name] = (root / name).read_bytes()
entries['metadata.json'] = json.dumps(dict(criterion='QA13', sha=sha, jobs=jobs,
    workflows=5, namedTests=tests, browserReceipts=receipts, referenceContracts=references,
    acceptance=False, liveProvider=False, archivedUnits=len(catalog)), indent=2).encode()
write_entries_archive(root / f'docs/case-studies/issue-56/data/salary-targets-hosted-{slug}.tar.gz', entries)
