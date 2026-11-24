"""Preserve the source and native Linux evidence for private Node preparation."""
import json
from pathlib import Path
import subprocess

from evidence_bundle import changed_sources, write_entries_archive


root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
parent = '84ca65889375d7a67f5d81b1e5b3dbda48250521'
source = 'js/src/server/runner-tools/prepare-node.sh'
signed = 'node-26.13.0-SHASUMS256.txt.asc'
verified = 'node-26.13.0-SHASUMS256-verified.txt'

parent_failure = (logs / 'runner-node-parent.log').read_text()
assert "actual: 'runner-launcher-unavailable'" in parent_failure
assert "expected: 'runner-runtime-unavailable'" in parent_failure
node = (logs / 'runner-node-node.log').read_text()
assert 'tests 61' in node and 'pass 61' in node and 'fail 0' in node
assert '61 passed | 0 failed' in (logs / 'runner-node-deno.log').read_text()
native = (logs / 'runner-node-native-final.log').read_text().splitlines()
launches = [json.loads(line) for line in native[:-1]]
assert len(launches) == 2 and all(
    item['phase'] == 'launch' and item['code'] == 0 for item in launches)
receipt = json.loads(native[-1])
assert receipt == dict(nodeOnPath=False, npmOnPath=False, nativeScreen=True,
                      checksumRefusal=True, privateCache=True,
                      coldAndWarmReady=True, stopConfirmed=True)

checksums = dict(reversed(line.split()) for line in (logs / verified).read_text().splitlines())
script = (root / source).read_text()
for platform in ('linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64'):
    assert f'digest={checksums[f"node-v26.13.0-{platform}.tar.gz"]}' in script
assert (logs / verified).read_bytes() == (logs / 'node-26.13.0-SHASUMS256.txt').read_bytes()

package = json.loads((logs / 'runner-node-pack.json').read_text())[0]
package_files = [item for item in package['files'] if item['path'] in {
    source, 'js/src/server/runner-node.js', 'js/src/server/runner-tools/prepare.mjs',
    'js/src/server/runner-tools/locked-dependencies.json'}]
assert len(package_files) == 4

sources = changed_sources(root)
names = sources + ['experiments/issue-56/collect-runner-node.py',
                   'experiments/issue-56/evidence_bundle.py']
names += ['ci-logs/' + name for name in (signed, verified, 'runner-node-parent.log',
          'runner-node-node.log', 'runner-node-deno.log', 'runner-node-native-final.log',
          'runner-node-shellcheck.log', 'runner-node-format-check.log',
          'runner-node-source-lint.log')]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in sources:
    if name.startswith('js/src/') and subprocess.run(
        ['git', 'cat-file', '-e', f'{parent}:{name}'], cwd=root,
        stderr=subprocess.DEVNULL, check=False
    ).returncode == 0:
        entries['before/' + name] = subprocess.check_output(
            ['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(
    parent=parent, package=package['name'], packageFiles=package_files,
    releaseKeyring='481637f813e912c4aa3622d7964ab426c97b8e8d',
    signer='C82FA3AE1CBEDC6BE46B9360C43CEC45C17AB93C',
    nodeChecks=61, denoChecks=61, native=receipt,
    hostedChecksPending=True, criterion='VD01', criterionComplete=False
), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/runner-node-preparation.tar.gz',
                      entries, len(sources))
