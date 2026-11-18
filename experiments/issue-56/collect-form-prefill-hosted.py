"""Collect exact-source evidence for the complete shared prefill contract."""
import json
from pathlib import Path
import re
import subprocess
import sys
from evidence_bundle import write_entries_archive
from hosted_evidence import (
    browser_group_block, read_workflows, read_jobs, source_reader,
    read_catalog_audit, read_literal_tests, read_reference_contracts,
)

root = Path(__file__).resolve().parents[2]
revision, slug = sys.argv[1:]
sha = subprocess.check_output(['git', 'rev-parse', revision], cwd=root).decode().strip()
entries = {}
workflows = read_workflows(root, sha, slug, entries)
source = source_reader(root, sha, entries)
registry = json.loads(source('js/scripts/browser-checks.json'))
groups = ['forms-reader', 'forms-answers', 'forms-learning']
selection = {'node': ('Checks and release', 'Test (node on ubuntu-26.04)')}
for group in groups:
    for engine in ['chromium', 'webkit']:
        shard = registry.index(group) % 4 + 1
        selection[f'{engine}-{shard}'] = ('Checks and release',
            f'Browser e2e ({engine}, shard {shard}/4)')
raw, jobs = read_jobs(root, workflows, slug, selection, entries)
catalog_path = 'experiments/issue-56/form-prefill-evidence.json'
catalog = json.loads((root / catalog_path).read_text())
read_catalog_audit(root, sha, 'form-prefill-criteria', catalog, source, entries)
transport_templates = {
    'forms-auto-prefill': 'automatic prefilling uses trusted ${media} session mutations and recovers their receipts',
    'forms-private-resume': 'conventional PDF discovery and attachment share trusted ${media} transport',
    'forms-private-model': 'private resume model planning uses trusted ${media} without request-selected paths',
}
parameterized = {}
for stem, template in transport_templates.items():
    assert 'for (const media of [LINO_TEXT, LINO_BINARY])' in source(f'js/tests/{stem}.test.js')
    parameterized[stem] = {template: [template.replace('${media}', media)
        for media in ['text/lino', 'application/lino-binary']]}
tests = read_literal_tests([
    'forms-answer-plan', 'forms-review-prefill', 'forms-auto-prefill',
    'forms-review-custom', 'forms-review-choices', 'forms-review-upload',
    'forms-configured-resume', 'forms-private-profile', 'forms-private-resume',
    'forms-private-model', 'forms-link-answers', 'forms-timezone',
    'forms-pay-guidance', 'forms-model-review', 'forms-captcha',
    'forms-automatic-controls', 'answer-plain-text',
], source, raw['node'], parameterized=parameterized)
for path in [
    'js/src/forms/proposals.js', 'js/src/forms/profile-fields.js',
    'js/src/forms/automatic-prefill.js', 'js/src/forms/review-apply.js',
    'js/src/forms/review-targets.js', 'js/src/forms/prefill-control.js',
    'js/src/cli/forms-commands.js', 'js/src/cli/forms-review-commands.js',
    'js/src/server/routes-forms.js',
    'js/src/web/form-automatic-control.js', 'js/src/web/form-prefill-request.js',
    'js/src/web/form-automatic-result.js', 'js/tests/e2e-forms-reader-browser.mjs',
    'js/tests/helpers/e2e-form-automatic.mjs',
    'js/tests/helpers/e2e-form-automatic-controls.mjs',
    'js/tests/helpers/e2e-form-prefill.mjs',
    *[f'js/tests/helpers/e2e-form-private-{kind}.mjs' for kind in ['profile', 'resume', 'model']],
    *[f'js/tests/helpers/e2e-form-{kind}.mjs' for kind in [
        'radio', 'custom', 'choices', 'upload', 'model', 'captcha', 'links', 'timezone', 'pay']],
]:
    source(path)
receipts = {}
for group in groups:
    for engine in ['chromium', 'webkit']:
        shard = registry.index(group) % 4 + 1
        start, end, block = browser_group_block(raw[f'{engine}-{shard}'], group)
        assert any(f'[e2e-forms-reader] OK ({engine})' in line for line in block)
        parsed = {}
        for kind in {'forms-reader': ['profile', 'resume', 'model']}.get(group, []):
            marker = f'[forms-private-{kind}] '
            found = [json.loads(line.split(marker, 1)[1]) for line in block if marker in line]
            assert len(found) == 1, (engine, marker)
            receipt = found[0]
            assert receipt['closed'] and receipt['submissions'] == 0
            assert receipt['nativeReceipts'] == 1
            expected = 'form-resume-changed' if kind == 'resume' else 'form-answers-changed'
            assert receipt['changedSourceRefused'] == expected
            if kind == 'profile':
                assert receipt['privateFiles'] == 3 and not receipt['namedProfile']
                assert receipt['email'] == 'updated@example.test' and receipt['ownerNameRetained']
            elif kind == 'resume':
                assert receipt['source'] == 'resume/resume.pdf' and receipt['ownerFileRetained']
                assert receipt['savedSelectionUnchanged'] is True
                assert re.fullmatch('[a-f0-9]{64}', receipt['sha256'])
            else:
                assert receipt['source'] == 'resume/resume.md' and receipt['selectedCv'] == ''
                assert receipt['modelCalls'] == 2 and receipt['unknownPreserved'] and receipt['ownerPreserved']
            parsed[kind] = receipt
        if group == 'forms-answers':
            for scenario in ['verifyFormAutomaticUi', 'verifyFormCaptchaUi',
                             'verifyFormLinksUi', 'verifyFormTimezoneUi', 'verifyFormPayUi']:
                assert any(f'[forms-scenario] {scenario} started' in line for line in block)
                assert any(re.search(rf'\[forms-scenario\] {scenario} \d+\s*$', line) for line in block)
        if group == 'forms-learning':
            model_receipts = [json.loads(line.split('[forms-model] ', 1)[1])
                for line in block if '[forms-model] ' in line]
            assert model_receipts == [dict(calls=1, applied=True, clarification=True,
                stalePreserved=True, ownerPreserved=True, closed=True, submits=0)]
            parsed['optionalModel'] = model_receipts[0]
        receipts[f'{engine}/{group}'] = dict(startLine=start, completedLine=end, privateSources=parsed)
references = read_reference_contracts(root, {None: ['ci-logs/qa19-reference-forms.json']},
    entries, 'fa0991b8c2d0896fb3b4be6c69947f0590094b15')
for name in [catalog_path, 'experiments/issue-56/collect-form-prefill-hosted.py',
             'experiments/issue-56/hosted_evidence.py',
             'docs/case-studies/issue-56/form-prefill-criteria-audit.md']:
    entries[name] = (root / name).read_bytes()
entries['metadata.json'] = (json.dumps(dict(sha=sha, criterion='QA22', jobs=jobs,
    workflows=5, namedTests=tests, browserReceipts=receipts, referenceContracts=references,
    acceptance=False, liveProvider=False, liveModel=False), indent=2) + '\n').encode()
write_entries_archive(root / f'docs/case-studies/issue-56/data/form-prefill-hosted-{slug}.tar.gz', entries)
