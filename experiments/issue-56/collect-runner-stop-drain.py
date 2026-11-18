"""Preserve exact-parent regressions, native Stop receipts and corrected sources."""
from pathlib import Path
import hashlib
import json
import subprocess
from evidence_bundle import write_entries_archive, verify_evidence

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
read = lambda name: (logs / f'runner-stop-drain-{name}.log').read_text()
verify_evidence(read, {
    'before-node': ['tests 6', 'pass 0', 'fail 6', 'cancelled 0', 'skipped 0'],
    'focused': ['tests 22', 'pass 22', 'fail 0', 'cancelled 0', 'skipped 0'],
    'format-check': ['All matched files use Prettier code style!'],
    'source-limits': ['0 over the 1500 line limit'],
    'doc-limits': ['All documentation files are within the 2500 line limit.'],
})
before = (logs / 'runner-screen-stop-before-trace.log').read_text()
after = (logs / 'runner-screen-stop-after.log').read_text()
b = json.loads(before.splitlines()[0]); a = json.loads(after.splitlines()[0])
assert b['stopped']['code'] == 'runner-stop-unconfirmed' and not b['drainedAtReply']
assert b['final']['states']['local'] == 'stopped'
assert a['stopped']['ok'] and a['drainedAtReply']
assert a['final']['states']['local'] == 'stopped'
for receipt in [b, a]:
    assert receipt['isolated'] and not receipt['liveProvider']
    assert sum(command['option'] == '--stop' for command in receipt['commands']) == 1
    assert all(command['command'] in ['screen', '$'] for command in receipt['commands'])
blob = json.loads((logs / 'runner-stop-drain-start-blob.json').read_text())
import base64
control = base64.b64decode(blob['content'])
assert control == (logs / 'runner-stop-drain-start-execution-control.js').read_bytes()
assert hashlib.sha1(b'blob ' + str(len(control)).encode() + b'\0' + control).hexdigest() == blob['sha']
assert "status: action === ControlAction.STOP ? 'signal-sent'" in control.decode()
parent = '4bb612207b6cc2673862a6f5a196d13775096a6b'
paths = [
    'js/src/server/runner-control.js', 'js/tests/runner-control.test.js',
    'js/tests/runner-stop-drain.test.js', 'js/src/server/runner-controller.js',
    'js/src/server/runner-transport.js', 'experiments/issue-56/runner-screen-stop.mjs',
    'experiments/issue-56/runner-stop-drain-parent.py',
    'experiments/issue-56/parent_source_probe.py', 'experiments/issue-56/runner-fixture.mjs',
    'experiments/issue-56/collect-runner-stop-drain.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/runner-stop-drain.md',
]
entries = {name: (root / name).read_bytes() for name in paths}
for name in ['js/src/server/runner-control.js', 'js/tests/runner-control.test.js']:
    entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
for path in logs.glob('runner-stop-drain-*'):
    if path.is_file() and path.suffix in ['.json', '.log', '.js'] and not path.name.endswith('-commit.log'):
        entries[str(path.relative_to(root))] = path.read_bytes()
for name in ['runner-screen-stop-before-trace.log', 'runner-screen-stop-after.log']:
    entries[f'ci-logs/{name}'] = (logs / name).read_bytes()
entries['metadata.json'] = (json.dumps(dict(parent=parent, parentTests=6,
    parentFailures=6, focusedPasses=22, nativeCleanupMs=3500, nativeLocal=True,
    realSsh=False, actualApplication=False, liveProvider=False,
    upstreamCommit='8e37b91d649287f94fc0d4da93645f5b686fc1c4',
    upstreamControlBlob=blob['sha'], acceptedCriteria=83, unfinishedCriteria=35,
    issueComplete=False, hostedVerificationPending=True), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/runner-stop-drain.tar.gz', entries)
