"""Preserve exact parent sources and native runner npm preparation receipts."""
import json
import subprocess

from evidence_bundle import evidence_context, write_entries_archive


root, _, read = evidence_context(__file__, 'runner-npm')
parent = '0812c89de54785f34cb220dcabd5ef17f2a4f98b'
assert '"code":"runner-launcher-unavailable"' in read('native-parent')
assert 'tests 25' in read('node-tests') and 'pass 25' in read('node-tests')
assert '25 passed | 0 failed' in read('deno-tests')
native = json.loads(read('native-current'))
assert native == dict(nodeOnPath=True, npmOnPath=False, nativeScreen=True,
                      keptPathNode=True, warmWithoutNpmRuntime=True,
                      privateCache=True, coldAndWarmReady=True, stopConfirmed=True)
assert json.loads(read('native-ssh').splitlines()[-1]) == dict(native, actualSsh=True)
compatibility = json.loads(read('no-node-compatibility'))
assert not compatibility['nodeOnPath'] and compatibility['checksumRefusal']
assert compatibility['coldAndWarmReady'] and compatibility['stopConfirmed']

production = [
    'js/src/server/runner-dependencies.js',
    'js/src/server/runner-node.js',
    'js/src/server/runner-tools/prepare.mjs',
]
sources = production + [
    '.github/workflows/release.yml',
    'experiments/issue-56/collect-runner-npm.py',
    'experiments/issue-56/evidence_bundle.py',
    'experiments/issue-56/runner-node-local.mjs',
    'experiments/issue-56/runner-node-loopback-ssh.py',
    'js/tests/runner-dependencies.test.js',
    'js/tests/runner-node.test.js',
]
entries = {name: (root / name).read_bytes() for name in sources}
for name in production:
    entries['before/' + name] = subprocess.check_output(
        ['git', 'show', f'{parent}:{name}'], cwd=root)
for name in ('native-parent', 'native-current', 'native-ssh',
             'no-node-compatibility', 'node-tests', 'deno-tests', 'lint',
             'actionlint', 'secretlint'):
    entries[f'ci-logs/runner-npm-{name}.log'] = read(name).encode()
entries['metadata.json'] = (json.dumps(dict(
    parent=parent, criterion='VD01', criterionComplete=False,
    hostedChecksPending=True, nodeChecks=25, denoChecks=25,
    localNative=native, loopbackSsh=True
), indent=2) + '\n').encode()
write_entries_archive(
    root / 'docs/case-studies/issue-56/data/runner-npm-preparation.tar.gz',
    entries, len(sources))
