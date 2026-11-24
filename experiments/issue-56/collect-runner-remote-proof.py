"""Keep the first repaired Docker receipt and next Screen proof source separate."""
import json
import subprocess
from evidence_bundle import evidence_context, write_entries_archive

root, logs, read = evidence_context(__file__, 'runner-remote')
for name in ['secrets', 'diff']:
    assert not read(name).strip(), name
assert 'All matched files use Prettier code style!' in read('format-check')
assert not (logs / 'runner-screen-hosted-lint.log').read_text().strip()
assert not (logs / 'runner-screen-hosted-shellcheck.log').read_text().strip()
job = json.loads((logs / 'runner-retention-native-job.json').read_text())
parent = '9c42ac8048877a11936f93388b71da9a8f87f399'
assert job['head_sha'] == parent and job['conclusion'] == 'success'
receipt_path = 'ci-logs/docker-9c42ac80-artifact/runner-docker-hosted.log'
receipts = [json.loads(line) for line in (root / receipt_path).read_text().splitlines()]
assert receipts[-1] == {'applicationResourcesClosed': True}
assert receipts[-2] == dict(actualSsh=True, actualDocker=True, actualApplication=True,
    health='ready', explicitStarts=2, noImplicitLaunch=True, privateDataRetained=True,
    foreignContainerRefused=True, mutuallyExclusiveScreenAndDocker=True, liveProvider=False)
names = [
    'experiments/issue-56/runner-docker-hosted.mjs',
    'experiments/issue-56/runner-docker-hosted.sh',
    'experiments/issue-56/collect-runner-remote-proof.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/runner-remote-verification.md',
    'ci-logs/runner-retention-native-job.json',
    'ci-logs/native-docker-134609494750.log', receipt_path,
    'ci-logs/docker-9c42ac80-artifact/runner-docker-sshd.log',
    'ci-logs/vk-desktop-reference-requirements.source',
    'ci-logs/runner-screen-hosted-lint.log',
    'ci-logs/runner-screen-hosted-shellcheck.log',
] + [f'ci-logs/runner-remote-{name}.log' for name in ['secrets', 'diff', 'format-check', 'duplication']]
entries = {name: (root / name).read_bytes() for name in names}
for name in ['experiments/issue-56/runner-docker-hosted.mjs',
             'experiments/issue-56/runner-docker-hosted.sh', 'js/src/server/runner-docker.js']:
    entries['verified/' + name] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(verifiedDockerSource=parent,
    verifiedActualDocker=True, newRemoteScreenPending=True, localDaemon=False,
    acceptedCriteria=86, unfinishedCriteria=32, issueComplete=False), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/runner-remote-proof.tar.gz', entries)
