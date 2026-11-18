"""Bind conventional CV model grounding to parent and actual native evidence."""
import json
import subprocess
from evidence_bundle import evidence_context, evidence_logs, verify_evidence, write_entries_archive
from hosted_evidence import read_reference_contracts

root, logs, read = evidence_context(__file__, 'forms-private-model')
verify_evidence(read, {
    'before-node': ['tests 8', 'pass 1', 'fail 7', 'cancelled 0', 'skipped 0'],
    'focused': ['tests 30', 'pass 30', 'fail 0', 'cancelled 0', 'skipped 0'],
    'deno': ['30 passed', '0 failed'],
    'format-check': ['All matched files use Prettier code style!'],
    'source-limits': ['0 over the 1500 line limit'],
    'doc-limits': ['All documentation files are within the 2500 line limit.'],
})
before = read('native-before')
assert '[forms-private-model-before]' in before and 'OK (chromium)' in before
assert '"privateResume":true,"selectedCv":"","proposal":null,"submissions":0' in before
browser = read('browser')
assert '[e2e-forms-reader] OK (chromium)' in browser and 'SKIP' not in browser
receipt = json.loads(next(line.split('] ', 1)[1] for line in browser.splitlines()
                          if line.startswith('[forms-private-model] ')))
assert receipt == dict(source='resume/resume.md', selectedCv='', modelCalls=2,
    changedSourceRefused='form-answers-changed', nativeReceipts=1,
    unknownPreserved=True, ownerPreserved=True, submissions=0, closed=True)
parent = 'fa58010f126de5311049d09ab46fce3857db18fa'
production = ['js/src/forms/private-profile.js', 'js/src/forms/model-drafts.js',
              'js/src/automation/answer-model-context.js']
names = [*production, *evidence_logs(root, 'forms-private-model'),
    'js/tests/forms-private-model.test.js', 'js/tests/forms-model-review.test.js',
    'js/tests/answer-model-drafts.test.js', 'js/tests/forms-private-profile.test.js',
    'js/tests/e2e-forms-reader-browser.mjs',
    'js/tests/helpers/e2e-form-private-model.mjs',
    'experiments/issue-56/forms-private-model-fixture.mjs',
    'experiments/issue-56/forms-model-fixture.mjs',
    'experiments/issue-56/forms-model-review-fixture.mjs',
    'experiments/issue-56/forms-private-model-parent.py',
    'experiments/issue-56/parent_source_probe.py',
    'experiments/issue-56/hosted_evidence.py',
    'experiments/issue-56/evidence_bundle.py',
    'experiments/issue-56/collect-forms-private-model.py',
    'docs/case-studies/issue-56/forms-private-model.md',
    'ci-logs/qa19-reference-forms.json']
names += [f'docs/screenshots/issue-56-forms-private_model-{phase}.png'
          for phase in ['before', 'after', 'mobile']]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
references = read_reference_contracts(root,
    {None: ['ci-logs/qa19-reference-forms.json']}, entries,
    'fa0991b8c2d0896fb3b4be6c69947f0590094b15')
for name in production:
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent,
    referenceCommit='fa0991b8c2d0896fb3b4be6c69947f0590094b15',
    parentFailures=7, parentPositiveControls=1, focusedPasses=30, denoPasses=30,
    native=receipt, nativeParent=True, referenceContracts=references,
    acceptedCriteria=83, unfinishedCriteria=35,
    issueComplete=False, hostedVerificationPending=True), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/forms-private-model.tar.gz', entries)
