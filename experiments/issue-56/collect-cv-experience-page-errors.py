"""Retain the actual hosted failure and bounded native-form replay evidence."""
import hashlib
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
parent = 'b61cf5fd504e8e928eec5e4ed869087f869dd395'
job = json.loads((logs / 'hosted-b61-webkit-3-job.json').read_text())
assert job['id'] == 133345479581 and job['run_id'] == 43879915890
assert job['head_sha'] == parent and job['conclusion'] == 'failure'
assert job['status'] == 'completed'
raw = (logs / 'hosted-b61-webkit-3.log').read_text().splitlines()
assert '"scenario":"verifyCvExperience","phase":"failed"' in raw[1093]
assert 'Page errors:' in raw[1098] and 'access control checks' in raw[1098]
summary = json.loads((logs / 'hosted-b61-webkit-3-artifact-summary.json').read_text())
assert summary['engine'] == 'webkit' and summary['failures'] == ['cv-translation']
before = (logs / 'cv-experience-page-errors-before.log').read_text()
assert 'Error: Page errors: /127.0.0.1:' in before
assert 'due to access control checks.' in before
after = (logs / 'cv-experience-page-errors-after.log').read_text().splitlines()
assert 'handled WebKit same-origin network diagnostic' in after[0]
receipt = json.loads(after[-1])
assert receipt == {
    'parent': parent, 'before': False, 'replayed': 1,
    'nativeWebKit': True, 'injectedDiagnostic': True,
    'pairs': 1, 'ambiguous': 3, 'incomplete': 2,
    'locales': ['ru', 'hi', 'zh', 'en'],
    'layout': {'viewport': 390, 'width': 390}, 'errors': [],
}
tests = (logs / 'current-focused-tests.log').read_text()
assert 'tests 12' in tests and 'pass 12' in tests and 'fail 0' in tests
assert not (logs / 'current-scoped-lint.log').read_text().strip()
assert not (logs / 'cv-experience-group-lint.log').read_text().strip()
assert 'All matched files use Prettier code style!' in (logs / 'cv-experience-format-check.log').read_text()
inspections = [
    'experiments/issue-56/experience-inspect.mjs',
    'js/tests/helpers/e2e-cv-experience.mjs',
    'experiments/issue-56/experience-document-inspect.mjs',
    'js/tests/helpers/e2e-cv-experience-documents.mjs',
    'experiments/issue-56/linkedin-experience-inspect.mjs',
    'js/tests/helpers/e2e-cv-linkedin-experience.mjs',
    'experiments/issue-56/experience-plan-inspect.mjs',
    'js/tests/helpers/e2e-cv-experience-plan.mjs',
    'experiments/issue-56/formal-report-inspect.mjs',
    'js/tests/helpers/e2e-cv-formal-report.mjs',
]
sources = inspections + [
    'js/tests/helpers/e2e-page-errors.mjs',
    'js/tests/e2e-page-errors.test.js',
    'experiments/issue-56/cv-experience-page-errors.mjs',
    'experiments/issue-56/experience-browser-fixture.mjs',
    'experiments/issue-56/cv-loading-inspect.mjs',
    'experiments/issue-56/collect-cv-experience-page-errors.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/ci-cv-experience-page-errors.md',
    'docs/case-studies/issue-56/ci-cv-experience-page-errors-plan.md',
]
names = sources + [f'ci-logs/{name}' for name in [
    'hosted-b61-webkit-3-job.json', 'hosted-b61-webkit-3.log',
    'hosted-b61-webkit-3-artifact-cv-translation.log',
    'hosted-b61-webkit-3-artifact-summary.json',
    'cv-experience-page-errors-before.log', 'cv-experience-page-errors-after.log',
    'current-focused-tests.log', 'current-scoped-lint.log',
    'cv-experience-format-check.log', 'cv-experience-group-lint.log',
]]
entries = {name: (root / name).read_bytes() for name in names}
published = 'b558bd7424cd03b8e2a50e07ce123635a62b72f1'
hosted = {}
required = {'verifyCvExperience', 'verifyCvExperienceDocuments',
            'verifyCvLinkedinExperience', 'verifyCvExperiencePlans',
            'verifyCvFormalReports'}
for engine, ident in [('chromium', 133377235105), ('webkit', 133377235724)]:
    metadata = logs / f'hosted-b558-{engine}3-status.json'
    positive = json.loads(metadata.read_text())
    assert positive['id'] == ident and positive['head_sha'] == published
    assert positive['status'] == 'completed' and positive['conclusion'] == 'success'
    path = logs / f'hosted-b558-{engine}-3.log'
    results = {}
    for number, line in enumerate(path.read_text().splitlines(), 1):
        if '[browser-scenario] ' not in line:
            continue
        value = json.loads(line.split('[browser-scenario] ', 1)[1])
        if (value['group'] == 'cv-translation' and
                value['scenario'] in required and value['phase'] == 'passed'):
            assert value['scenario'] not in results
            assert not value['result'].get('errors', [])
            results[value['scenario']] = {'line': number, 'receipt': value}
    assert set(results) == required
    hosted[engine] = {'job': positive['html_url'], 'results': results}
    entries[str(metadata.relative_to(root))] = metadata.read_bytes()
    entries[str(path.relative_to(root))] = path.read_bytes()
for name in inspections:
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'{parent}:{name}'], cwd=root)
    assert (root / name).read_bytes() == subprocess.check_output(
        ['git', 'show', f'{published}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'parent': parent, 'job': job['html_url'], 'artifactId': 14234221129,
    'artifactSha256': hashlib.sha256((logs / 'hosted-b61-webkit-3-artifact.zip').read_bytes()).hexdigest(),
    'originalErrorNamesRetained': False, 'replay': receipt,
    'beforeExit': 1, 'afterExit': 0, 'issueComplete': False,
    'correctedHostedSource': published, 'correctedHostedScenarios': hosted,
    'wholeWorkflowSuccess': False, 'inventoryAccepted': False,
}, indent=2) + '\n').encode()
write_entries_archive(
    root / 'docs/case-studies/issue-56/data/ci-cv-experience-page-errors.tar.gz', entries)
