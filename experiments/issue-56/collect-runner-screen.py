"""Preserve the actual hosted collision, pinned lookup and finite regression."""
from pathlib import Path
import json
import subprocess
from evidence_bundle import changed_sources, evidence_logs, verify_evidence, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
read = lambda name: (logs / f'runner-screen-{name}.log').read_text()
verify_evidence(read, {
    'before': ['tests 4', 'pass 2', 'fail 2'],
    'focused': ['tests 43', 'pass 43', 'fail 0', 'cancelled 0', 'skipped 0'],
    'format-check': ['All matched files use Prettier code style!'],
    'source-limits': ['0 over the 1500 line limit'],
    'doc-limits': ['All documentation files are within the 2500 line limit.'],
    'zizmor': ['No findings to report.'],
}, empty=('lint-final', 'secrets', 'diff-check'))
names = changed_sources(root) + evidence_logs(root, 'runner-screen')
names += [
    'experiments/issue-56/evidence_bundle.py',
    'experiments/issue-56/application_parent_fixture.py',
    'ci-logs/native-docker-134599157780.log',
    'ci-logs/workflow-contracts-134599157142.log',
    'ci-logs/docker-802c6168-artifact/runner-docker-hosted.log',
    'ci-logs/docker-802c6168-artifact/runner-docker-sshd.log',
    'ci-logs/runner-start-query-commands.source',
    'ci-logs/runner-start-execution-control.source',
    'ci-logs/runner-screen-failed-run.json',
]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
parent = '802c6168fb696f9aee056b4785b09649b8a1b01e'
for name in ['js/src/server/runner-control.js', 'js/src/server/runner-session.js',
             '.github/workflows/release.yml']:
    entries['before/' + name] = subprocess.check_output(
        ['git', 'show', f'{parent}:{name}'], cwd=root)
run = json.loads(entries['ci-logs/runner-screen-failed-run.json'])
assert run['head_sha'] == parent
entries['metadata.json'] = (json.dumps(dict(
    parent=parent, startReference='3872bd031f5b51902e20bd22b84e9d51a59fcc0b',
    parentFailures=2, compatibleControls=2, nodePasses=43,
    actualHostedFailure=True, repairedHostedVerificationPending=True,
    localDocker=False, liveProvider=False, acceptedCriteria=86,
    unfinishedCriteria=32, issueComplete=False), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/runner-screen-stop.tar.gz', entries)
