"""Bind the complete QA15 mapping to exact-source hosted and archived evidence.

Preserve all five workflow responses and Node plus both shard-two logs using
hosted-verification-SLUG-*.json and hosted-SLUG-TAG.log before running this.
Run audit-hosted-criteria.py with salary-band-evidence.json for the same SHA.
Integrity and positive receipts do not independently accept a criterion.
"""
import ast
import base64
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tarfile
from evidence_bundle import write_entries_archive
from hosted_evidence import read_workflows, read_jobs

root = Path(__file__).resolve().parents[2]
revision, slug = sys.argv[1:]
sha = subprocess.check_output(['git', 'rev-parse', revision], cwd=root).decode().strip()
logs = root / 'ci-logs'
entries = {}
runs = read_workflows(root, sha, slug, entries)
raw, jobs = read_jobs(root, runs, slug, {
    'node': ('Checks and release', 'Test (node on ubuntu-26.04)'),
    'chromium-2': ('Checks and release', 'Browser e2e (chromium, shard 2/4)'),
    'webkit-2': ('Checks and release', 'Browser e2e (webkit, shard 2/4)'),
}, entries)


def source(name):
    content = subprocess.check_output(['git', 'show', f'{sha}:{name}'], cwd=root)
    entries[name] = content
    return content.decode()


catalog = json.loads((root / 'experiments/issue-56/salary-band-evidence.json').read_text())
audit_path = logs / 'salary-band-criteria-source-audit.json'
audit = json.loads(audit_path.read_text())
assert audit['revision'] == sha and set(audit['archives']) == set(catalog)
for name, archive in audit['archives'].items():
    path = root / 'docs/case-studies/issue-56/data' / f'{name}.tar.gz'
    assert hashlib.sha256(path.read_bytes()).hexdigest() == archive['archiveSha256']
    manifest = path.with_suffix('').with_suffix('.tar.sha256.json')
    assert hashlib.sha256(manifest.read_bytes()).hexdigest() == archive['manifestSha256']
    entries[str(manifest.relative_to(root))] = manifest.read_bytes()
    for path, hashes in archive['sources'].items():
        assert hashlib.sha256(source(path).encode()).hexdigest() == hashes['current'], path

literal = re.compile(r'''\btest\(\s*((?:'(?:\\.|[^'\\])*')|(?:"(?:\\.|[^"\\])*"))\s*,''')
tests = {}
for stem in catalog:
    path = f'js/tests/{stem}.test.js'
    names = [ast.literal_eval(match.group(1)) for match in literal.finditer(source(path))]
    assert names and len(names) == len(set(names)), path
    tests[path] = {}
    for name in names:
        lines = [i for i, line in enumerate(raw['node'], 1) if f'✔ {name} (' in line]
        assert len(lines) == 1, (name, lines)
        tests[path][name] = lines[0]
assert sum(map(len, tests.values())) == 53
assert any('ℹ fail 0' in line for line in raw['node'])

scenario_entry = source('js/tests/e2e-question-salary-options-browser.mjs')
assert 'question-salary-options' in scenario_entry
scenarios = {
    'verifySalaryBandSafety': dict(cases=3, blockedClicks=0, nativeReceipts=1),
    'verifySalaryBandWatch': dict(cases=2, nativeReceipts=1),
    'verifySalaryBandSaved': dict(cases=1, nativeReceipts=1),
    'verifySalaryBandCurrencies': dict(cases=1, nativeReceipts=1),
}
for name in scenarios:
    assert f'  {name},' in scenario_entry, name
for name in ['safety', 'watch', 'saved', 'currencies']:
    source(f'js/tests/helpers/e2e-salary-band-{name}.mjs')
assert 'await verifySalaryBandOverlap(' in source('js/tests/helpers/e2e-salary-band-watch.mjs')
assert 'await verifySalaryChoiceCurrency(' in source('js/tests/helpers/e2e-salary-band-watch.mjs')
form_source = source('js/tests/helpers/e2e-form-salary-options.mjs')
assert 'await verifyFormSavedBaseline(' in form_source
source('js/tests/helpers/e2e-form-saved-baseline.mjs')
source('js/tests/helpers/e2e-form-nearest-bases.mjs')
source('js/tests/helpers/e2e-form-review.mjs')
form_entry = source('js/tests/e2e-forms-reader-browser.mjs')
assert '    verifyFormSalaryOptions,' in form_entry
assert '    verifyFormNearestBases,' in form_entry
assert '    await verify({' in form_entry
registration = json.loads(source('js/scripts/browser-checks.json'))
assert 'question-salary-options' in registration and 'forms-answers' in registration
runner = source('js/scripts/run-browser-checks.mjs')
assert 'timeout: 180_000' in runner and 'FORMS_GROUP:' in runner
scripts = json.loads(source('package.json'))['scripts']
assert scripts['test:e2e:question-salary-options'] == 'node js/tests/e2e-question-salary-options-browser.mjs'
assert scripts['test:e2e:forms-answers'] == 'node js/tests/e2e-forms-reader-browser.mjs'
receipts = {}
common = dict(pageErrors=[], liveProvider=False, before=False, textSends=0)
for engine in ['chromium', 'webkit']:
    lines = raw[f'{engine}-2']
    assert any(f'[e2e-question-salary-options] OK ({engine})' in line for line in lines)
    assert any(f'[e2e-forms-reader] OK ({engine})' in line for line in lines)
    for name, expected in scenarios.items():
        matches = []
        for i, line in enumerate(lines, 1):
            if '[browser-scenario] ' not in line:
                continue
            value = json.loads(line.split('[browser-scenario] ', 1)[1])
            if (value['group'], value['scenario'], value['phase']) == (
                    'question-salary-options', name, 'passed'):
                matches.append((i, value))
        assert len(matches) == 1, (engine, name)
        line, value = matches[0]
        expected = dict(common, **expected)
        if name == 'verifySalaryBandWatch':
            expected.update(
                overlap=dict(common, cases=1, nativeReceipts=0),
                currency=dict(common, cases=2, nativeReceipts=1))
        assert value['result'] == expected, (engine, name, value['result'])
        receipts[f'{engine}/{name}'] = dict(line=line, receipt=value)
    for marker, expected in {
        'forms-salary-options': dict(both='0', nearest='1', receipts=3,
                                    ambiguousHeld=True, inclusive='floor',
                                    recovered=True, closed=True, submissions=0),
        'forms-nearest-bases': dict(before=False, receipts=1, recovered=True,
                                   closed=True, submissions=0, automatic=False),
        'forms-saved-baseline': dict(before=False, receipts=1, recovered=True,
                                    closed=True, submissions=0, configuredSalary=False),
    }.items():
        matches = [(i, json.loads(line.split(f'[{marker}] ', 1)[1]))
                   for i, line in enumerate(lines, 1) if f'[{marker}] ' in line]
        assert len(matches) == 1 and matches[0][1] == expected, (engine, marker, matches)
        receipts[f'{engine}/{marker}'] = dict(line=matches[0][0], receipt=matches[0][1])

references = {}
for archive_name, paths in {
    'salary-option-contract': ['ci-logs/salary-options-reference-readme.json',
                               'ci-logs/salary-options-reference-tests.json'],
    'salary-band-numbers': [f'ci-logs/salary-band-numbers-reference-{i}.json'
                            for i in range(3)],
}.items():
    with tarfile.open(root / 'docs/case-studies/issue-56/data' / f'{archive_name}.tar.gz') as archive:
        for path in paths:
            response = archive.extractfile(path).read()
            reference = json.loads(response)
            content = base64.b64decode(reference['content'])
            blob = b'blob ' + str(len(content)).encode() + b'\0' + content
            assert hashlib.sha1(blob).hexdigest() == reference['sha'], path
            assert 'fa0991b8c2d0896fb3b4be6c69947f0590094b15' in reference['html_url']
            entries[path] = response
            entries[f'references/{reference["path"]}'] = content
            references[reference['path']] = dict(url=reference['html_url'], blob=reference['sha'])
assert {'src/salary-options.mjs', 'tests/salary-options.test.mjs',
        'tests/chat-options.test.mjs', 'README.md'} <= set(references)
for name in ['salary-band-criteria-source-audit.json', 'salary-band-criteria-source-deltas.diff']:
    entries[f'ci-logs/{name}'] = (logs / name).read_bytes()
for name in ['experiments/issue-56/collect-salary-band-hosted.py',
             'experiments/issue-56/hosted_evidence.py',
             'experiments/issue-56/evidence_bundle.py',
             'experiments/issue-56/salary-band-evidence.json',
             'experiments/issue-56/audit-hosted-criteria.py',
             'docs/case-studies/issue-56/salary-band-criteria-audit.md']:
    entries[name] = (root / name).read_bytes()
entries['metadata.json'] = (json.dumps(dict(
    sha=sha, workflows=5, jobs=jobs, namedTests=tests, browserReceipts=receipts,
    referenceContracts=references, criterion='QA15', archivedUnits=len(catalog),
    liveProvider=False, acceptance=False,
), indent=2) + '\n').encode()
write_entries_archive(root / f'docs/case-studies/issue-56/data/salary-band-hosted-{slug}.tar.gz', entries)
print(f'Verified 53 named salary checks and {len(receipts)} native receipts at {sha}')
