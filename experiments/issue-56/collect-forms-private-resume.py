"""Bind conventional PDF discovery to actual parent, native and focused checks."""
import base64
import hashlib
import json
import subprocess
from evidence_bundle import (
    changed_sources, evidence_context, evidence_logs,
    verify_evidence, write_entries_archive,
)

root, logs, read = evidence_context(__file__, 'forms-private-resume')
verify_evidence(read, {
    'before-node': ['tests 12', 'pass 5', 'fail 7', 'cancelled 0', 'skipped 0'],
    'focused': ['tests 38', 'pass 38', 'fail 0', 'cancelled 0', 'skipped 0'],
    'deno': ['23 passed', '0 failed'],
    'format-check': ['All matched files use Prettier code style!'],
    'source-limits': ['0 over the 1500 line limit'],
    'doc-limits': ['All documentation files are within the 2500 line limit.'],
})
before = read('native-before')
browser = read('browser')
assert '[e2e-forms-reader] OK (chromium)' in before
assert '"filesPresent":1,"selectedResume":null,"submissions":0' in before
assert '[e2e-forms-reader] OK (chromium)' in browser and 'SKIP' not in browser
native = json.loads(next(line.split('] ', 1)[1] for line in browser.splitlines()
                         if line.startswith('[forms-private-resume] ')))
assert native == dict(source='resume/resume.pdf',
    changedSourceRefused='form-resume-changed',
    sha256='015dec36bf50048ad019654e1b848df424170fa1fb76fd0f793bfb82a8e42aad',
    ownerFileRetained=True, nativeReceipts=1, submissions=0, closed=True)
reference_name = 'ci-logs/private-profile-reference-form-prefill.mjs.json'
reference = json.loads((root / reference_name).read_text())
reference_data = base64.b64decode(reference['content'])
assert reference_data == (root / 'ci-logs/private-profile-reference-form-prefill.mjs').read_bytes()
assert hashlib.sha1(b'blob ' + str(len(reference_data)).encode() + b'\0' +
                    reference_data).hexdigest() == reference['sha']
parent = '5283e26af0135f86fc879a30be18ae418da17c4a'
names = changed_sources(root) + evidence_logs(root, 'forms-private-resume')
names += ['experiments/issue-56/evidence_bundle.py',
          'experiments/issue-56/parent_source_probe.py',
          'js/src/forms/resume-data.js', 'js/src/forms/configured-resume.js',
          'js/src/forms/resume-upload.js', 'js/src/forms/automatic-prefill.js',
          'ci-logs/qa19-reference-forms.json', reference_name,
          'ci-logs/private-profile-reference-form-prefill.mjs']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in ['js/src/forms/private-profile.js', 'js/src/forms/review-prefill.js',
             'js/src/forms/review-upload.js']:
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent,
    referenceCommit='fa0991b8c2d0896fb3b4be6c69947f0590094b15',
    parentFailures=7, parentPositiveControls=5, focusedPasses=38, denoPasses=23,
    native=native, nativeParent=True, acceptedCriteria=83, unfinishedCriteria=35,
    issueComplete=False, hostedVerificationPending=True), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/forms-private-resume.tar.gz', entries)
