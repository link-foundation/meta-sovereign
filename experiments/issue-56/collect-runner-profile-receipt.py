"""Preserve the obsolete assertion, actual remote receipts and corrected test."""
import json
import subprocess
from evidence_bundle import evidence_context, write_entries_archive

root, logs, read = evidence_context(__file__, 'runner-profile-receipt')
parent = '13623bf7d51aed6a0d570c7e6efbabff726d0e87'
assert 'undefined' in read('before') and "new@example.invalid" in read('before')
assert 'pass 19' in read('focused') and 'fail 0' in read('focused')
assert not read('lint').strip() and not read('diff').strip()
assert 'All matched files use Prettier code style!' in read('format-check')
job = json.loads((logs / 'runner-receipt-native-job.json').read_text())
assert job['head_sha'] == parent and job['conclusion'] == 'success'
artifact = logs / 'runner-receipt-native-artifact/runner-docker-hosted.log'
lines = [json.loads(line) for line in artifact.read_text().splitlines()]
receipts = [line for line in lines if 'serverIsolation' in line]
assert [line['serverIsolation'] for line in receipts] == ['docker', 'screen']
for receipt in receipts:
    assert receipt['actualSsh'] and receipt['actualApplication']
    assert receipt['health'] == 'ready' and receipt['explicitStarts'] == 2
    assert receipt['mutuallyExclusiveModes'] and receipt['privateDataRetained']
    assert receipt['noImplicitLaunch'] and not receipt['liveProvider']
assert receipts[0]['actualDocker'] and receipts[0]['foreignContainerRefused']
assert lines.count({'applicationResourcesClosed': True}) == 2
names = [
    'js/tests/runner-configuration.test.js',
    'experiments/issue-56/collect-runner-profile-receipt.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/runner-profile-receipt.md',
    'docs/case-studies/issue-56/runner-remote-verification.md',
    'ci-logs/runner-receipt-current-jobs.json',
    'ci-logs/runner-receipt-native-job.json',
    'ci-logs/runner-receipt-native-linux.log',
    'ci-logs/runner-receipt-native-artifact/runner-docker-hosted.log',
    'ci-logs/runner-receipt-native-artifact/runner-docker-sshd.log',
] + [f'ci-logs/runner-profile-receipt-{name}.log' for name in
     ['before', 'focused', 'lint', 'diff', 'format-check']]
failed_jobs = sorted(logs.glob('runner-receipt-job-*.log'))
assert len(failed_jobs) == 9
for log in failed_jobs:
    text = log.read_text()
    assert 'local target edits cannot redirect Stop or hide a running retained address' in text, log.name
    assert 'runner-configuration.test.js' in text, log.name
    assert 'new@example.invalid' in text, log.name
    names.append(str(log.relative_to(root)))
entries = {name: (root / name).read_bytes() for name in names}
for name in ['js/tests/runner-configuration.test.js',
             'js/src/server/runner-control.js',
             'experiments/issue-56/runner-docker-hosted.mjs',
             'experiments/issue-56/runner-docker-hosted.sh']:
    entries['verified/' + name] = subprocess.check_output(
        ['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(verifiedSource=parent,
    actualSshBackends=['docker', 'screen'], runtimeGatePassing=False,
    acceptedCriteria=86, unfinishedCriteria=32, issueComplete=False), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/runner-profile-receipt.tar.gz', entries)
