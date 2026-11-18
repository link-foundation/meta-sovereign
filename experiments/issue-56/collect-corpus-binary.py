"""Preserve finite binary-layout evidence without accepting unfinished criteria."""
import json
import subprocess
from evidence_bundle import (
    changed_sources, evidence_context, evidence_logs, verify_evidence,
    write_entries_archive,
)

root, logs, read = evidence_context(__file__, 'corpus-binary')
verify_evidence(read, {
    'parent-final': ['ℹ tests 3', 'ℹ pass 2', 'ℹ fail 1'],
    'layout-final': ['ℹ tests 3', 'ℹ pass 3', 'ℹ fail 0'],
    'focused': ['ℹ tests 21', 'ℹ pass 21', 'ℹ fail 0'],
    'compatibility': ['ℹ tests 11', 'ℹ pass 11', 'ℹ fail 0'],
    'profile-after': ['ℹ tests 1', 'ℹ pass 1', 'ℹ fail 0'],
    'format-final': ['All matched files use Prettier code style!'],
})
modes = [json.loads(line) for line in read('modes').splitlines()]
assert [(row['external'], row['tuples']) for row in modes] == [
    (False, False), (True, False), (False, True), (True, True)]
assert all(row['rows'] == 101 for row in modes)
assert modes[-1]['links'] * 2 < modes[0]['links']
assert modes[-1]['bytes'] < modes[0]['bytes']
upstream = [json.loads(line) for line in read('upstream').splitlines()]
assert len(upstream) == 2 and all(row['rows'] == 101 for row in upstream)
assert upstream[-1]['bytes'] < upstream[0]['bytes']
assert '0.31.6' in read('registry-version')
assert 'https://github.com/link-foundation/links-notation/issues/420' in read('upstream-issue')
names = set(changed_sources(root))
names.update(evidence_logs(root, 'corpus-binary'))
names.update({
    'ci-logs/ci-5f63-node-macos-2.log',
    'ci-logs/corpus-binary.cpuprofile',
    'experiments/issue-56/evidence_bundle.py',
    'experiments/issue-56/previous-module.mjs',
    'experiments/issue-56/vacancy-corpus-fixture.mjs',
    'js/tests/vacancy-corpus.test.js',
    'js/tests/lino-transport.test.js',
    'js/tests/backup-recovery.test.js',
    'js/tests/sync-wire.test.js',
})
entries = {name: (root / name).read_bytes() for name in sorted(names)}
parent = '431935dc5e53a7e38d90944e2a538703cb108a0c'
path = 'js/src/transport/lino.js'
entries[f'before/{path}'] = subprocess.check_output(
    ['git', 'show', f'{parent}:{path}'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'parent': parent, 'modes': modes, 'publishedLatestProbe': upstream,
    'hostedFailure': dict(head='5f63c49f74d38e2d9885314c734a764e9dc2f656',
                          job=134788617058, timeoutMs=10000),
    'acceptedInventoryRows': [], 'issueComplete': False,
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/corpus-binary.tar.gz', entries)
