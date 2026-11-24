"""Preserve the hosted EC2 setup timeout and finite source-file regression."""
import base64
import hashlib
import json
import subprocess
from evidence_bundle import evidence_context, evidence_logs, verify_evidence, write_entries_archive

root, logs, read = evidence_context(__file__, 'browser-apt-ec2')
parent = '5e438e1b1413b6c724170bd05acfa1fe34a46179'
verify_evidence(read, {
    'before': ['tests 6', 'pass 5', 'fail 1', '0 !== 2'],
    'after': ['tests 26', 'pass 26', 'fail 0', 'cancelled 0', 'skipped 0'],
    'format-check': ['All matched files use Prettier code style!'],
    'source-limits': ['0 over the 1500 line limit'],
    'doc-limits': ['All documentation files are within the 2500 line limit.'],
})
run = json.loads((logs / '5e438e1b-pages-cancelled.json').read_text())
assert run['headSha'] == parent and run['conclusion'] == 'cancelled'
annotations = json.loads((logs / '5e438e1b-pages-annotations.json').read_text())
assert any('maximum execution time of 15m0s' in a['message'] for a in annotations)
raw = (logs / '5e438e1b-pages-cancelled.log').read_text()
assert 'Browser APT sources updated: 0' in raw
assert 'us-east-2.ec2.archive.ubuntu.com/ubuntu' in raw
reference = json.loads((logs / 'browser-apt-ec2-runner-reference.json').read_text())
content = base64.b64decode(reference['content'])
assert hashlib.sha1(b'blob ' + str(len(content)).encode() + b'\0' + content).hexdigest() == reference['sha']
names = [
    'js/scripts/prepare-browser-apt.mjs', 'js/tests/ci-browser-apt.test.js',
    'js/tests/ci-contracts.test.js', '.github/workflows/pages.yml',
    '.github/workflows/release.yml',
    'experiments/issue-56/collect-browser-apt-ec2.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/ci-browser-apt-ec2.md',
    'ci-logs/5e438e1b-pages-cancelled.json',
    'ci-logs/5e438e1b-pages-cancelled.log',
    'ci-logs/5e438e1b-pages-annotations.json',
    'ci-logs/browser-apt-ec2-solution.diff',
    *evidence_logs(root, 'browser-apt-ec2', ('.log', '.json', '.sh')),
]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
entries['before/js/scripts/prepare-browser-apt.mjs'] = subprocess.check_output([
    'git', 'show', f'{parent}:js/scripts/prepare-browser-apt.mjs'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent, beforeFailures=1,
    beforePositiveControls=5, focusedChecks=26, localAptChanged=False,
    hostedVerificationPending=True, acceptedCriteria=83, unfinishedCriteria=35,
    issueComplete=False), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/browser-apt-ec2.tar.gz', entries)
