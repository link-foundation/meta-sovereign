"""Snapshot live npm metadata for every locked and declared dependency."""
import concurrent.futures
import json
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dev/log/issues/50/pulls/51/research'
current = json.loads((ROOT / 'package-lock.json').read_text())
peer_snapshot = OUT / 'optional-peer-lock.json'
trees = [current]
if peer_snapshot.exists():
    trees.append(json.loads(peer_snapshot.read_text()))
before = json.loads((OUT / 'package-lock-before.json').read_text())
manifest = json.loads((OUT / 'package-before.json').read_text())
pins = {}
for path, package in before['packages'].items():
    if path:
        name = package.get('name', path.rsplit('node_modules/', 1)[-1])
        pins.setdefault(name, set()).add(package['version'])
for tree in trees:
    for path, package in tree['packages'].items():
        if path:
            pins.setdefault(package.get('name', path.rsplit('node_modules/', 1)[-1]), set())
for section in ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']:
    for name, version in manifest.get(section, {}).items():
        pins.setdefault(name, set()).add(version)
for name in ['npm', 'node', '@capacitor/cli', 'electron', 'electron-updater',
             'lodash.isequalwith', 'npm-check-updates', '@changesets/config']:
    pins.setdefault(name, set())


def fetch(item):
    name, versions = item
    url = 'https://registry.npmjs.org/' + quote(name, safe='@') + '/latest'
    try:
        with urlopen(Request(url, headers={'Accept': 'application/json'})) as response:
            package = json.load(response)
        return name, {
            'before': sorted(versions), 'latest': package['version'], 'source': url,
            'engines': package.get('engines', {}),
            'repository': package.get('repository'),
            'dependencies': package.get('dependencies', {}),
            'deprecated': package.get('deprecated'),
        }
    except Exception as error:
        return name, {'before': sorted(versions), 'error': str(error), 'source': url}


with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    results = dict(pool.map(fetch, sorted(pins.items())))
(OUT / 'npm-registry.json').write_text(json.dumps(results, indent=2) + '\n')
installed = {}
parents = {}
for tree in trees:
    for path, package in tree['packages'].items():
        parent = package.get('name', path.rsplit('node_modules/', 1)[-1]) if path else 'meta-sovereign'
        if path:
            installed.setdefault(parent, set()).add(package['version'])
        for section in ['dependencies', 'optionalDependencies', 'peerDependencies']:
            for name, constraint in package.get(section, {}).items():
                parents.setdefault(name, set()).add(f"{parent}: {constraint}")
lines = ['# npm registry inventory', '',
         'Live registry latest dist-tags captured on 2026-10-28. Includes every platform-specific, optional and nested root lock entry, plus a fresh lock-only resolution of all optional peers with the production desktop override. Before versions for previously unlocked peer transitives are marked new/tool; their parent ranges are recorded. The optional-peer snapshot and zero-vulnerability audit are in the evidence archive.', '',
         '| Dependency | Before | After | Registry latest | Decision / parent constraints |',
         '| --- | --- | --- | --- | --- |']
manifest_now = json.loads((ROOT / 'package.json').read_text())
for name, data in results.items():
    after = ', '.join(sorted(installed.get(name, set())))
    if not after:
        after = manifest_now.get('peerDependencies', {}).get(name, 'removed')
    latest = data.get('latest', data.get('error'))
    versions = installed.get(name, set())
    behind = versions - {latest}
    reason = 'Removed from the refreshed tree.' if after == 'removed' else 'Current latest.'
    if behind:
        constraints = '; '.join(sorted(parents.get(name, set())))
        reason = ('Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. ' + constraints)
        if '27.0.0-alpha' in after or '10.0.0-alpha' in after:
            reason = 'Newer v27 prerelease retained: stable v26 contains deprecated packages; upstream electron-builder issue 10016. ' + constraints
    if name in ['npm', 'node']:
        after = '12.2.1' if name == 'npm' else '26.12.1'
        reason = 'Toolchain pinned across workflows and Docker.'
    if name == 'npm-check-updates':
        after = latest
        reason = 'One-off upgrade tool used for this investigation; not a runtime dependency.'
    if name == 'lodash.isequalwith':
        after = '4.4.0 (staged updater alias)'
        reason = 'Scoped desktop override in prepare-desktop; preserves updater equality until electron-builder issue 10016 is released.'
    lines.append(f"| {name} | {', '.join(data['before']) or 'new/tool'} | {after} | {latest} | {reason} |")
(OUT / 'npm-inventory.md').write_text('\n'.join(lines) + '\n')
print(f"Captured {len(results)} npm dependencies; {sum('error' in x for x in results.values())} errors")
