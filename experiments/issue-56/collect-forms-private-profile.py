"""Keep automatic private Forms defaults tied to actual source and native checks."""
import base64
import hashlib
import json
import subprocess
from evidence_bundle import (
    changed_sources, evidence_context, evidence_logs,
    verify_evidence, write_entries_archive,
)

root, logs, read = evidence_context(__file__, 'forms-private-profile')
verify_evidence(read, {
    'before-node': ['tests 11', 'pass 0', 'fail 11', 'cancelled 0', 'skipped 0'],
    'focused': ['tests 47', 'pass 47', 'fail 0', 'cancelled 0', 'skipped 0'],
    'format-check': ['All matched files use Prettier code style!'],
    'source-limits': ['0 over the 1500 line limit'],
    'doc-limits': ['All documentation files are within the 2500 line limit.'],
})
browser = read('browser')
before = read('native-before')
assert '[e2e-forms-reader] OK (chromium)' in before
assert '"filesPresent":3,"proposal":null,"submissions":0' in before
assert '[e2e-forms-reader] OK (chromium)' in browser and 'SKIP' not in browser
native = json.loads(next(line.split('] ', 1)[1] for line in browser.splitlines()
                         if line.startswith('[forms-private-profile] ')))
assert native == dict(namedProfile=False, privateFiles=3,
                      changedSourceRefused='form-answers-changed',
                      email='updated@example.test', ownerNameRetained=True,
                      nativeReceipts=1, submissions=0, closed=True)
reference_names = ['contacts', 'form-prefill.mjs', 'form-slots']
reference_entries = {}
for name in reference_names:
    json_name = f'ci-logs/private-profile-reference-{name}.json'
    # Contacts/slots decoded snapshots retain their .mjs extension.
    decoded_name = f'ci-logs/private-profile-reference-{name}'
    if not decoded_name.endswith('.mjs'):
        decoded_name += '.mjs'
    blob = json.loads((root / json_name).read_text())
    data = base64.b64decode(blob['content'])
    assert data == (root / decoded_name).read_bytes()
    assert hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() == blob['sha']
    reference_entries[json_name] = (root / json_name).read_bytes()
    reference_entries[decoded_name] = data
parent = '77bd5f7129c8c1a628832f0ce63875d5b83875a9'
names = changed_sources(root) + evidence_logs(root, 'forms-private-profile')
names += ['experiments/issue-56/evidence_bundle.py',
          'experiments/issue-56/parent_source_probe.py']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
entries.update(reference_entries)
for name in ['js/src/forms/answer-plan.js', 'js/src/forms/answer-learning.js',
             'js/src/automation/question-profile-source.js']:
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent,
    referenceCommit='fa0991b8c2d0896fb3b4be6c69947f0590094b15',
    parentFailures=11, focusedPasses=47, native=native, nativeParent=True,
    acceptedCriteria=83, unfinishedCriteria=35, issueComplete=False,
    hostedVerificationPending=True), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/forms-private-profile.tar.gz', entries)
