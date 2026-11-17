"""Preserve finite independent job evidence without accepting VD03 prematurely."""
import base64
import hashlib
import json
from pathlib import Path
import subprocess
from evidence_bundle import evidence_logs, verify_evidence, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
prefix = 'vk-independent'
verify_evidence(lambda name: (logs / f'{prefix}-{name}.log').read_text(), {
    'node-final': ['pass 6', 'fail 0'],
    'bun': ['6 pass', '0 fail'],
    'deno': ['6 passed | 0 failed'],
    'browser-final': ['[e2e-vk-independent] OK (chromium)', '"acknowledgedToggles":12', '"providerEffects":0', '"pageErrors":0'],
    'format-check': ['All matched files use Prettier code style!'],
    'limits': ['0 over the 1500 line limit'],
}, empty=('lint-final', 'secrets', 'diff'))
mcp = json.loads((logs / 'vk-independent-mcp-final.json').read_text())
result = json.loads(mcp['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert result == dict(independentPolicies=6, acknowledgedToggles=12, reloads=6, errors=[], liveProvider=False)
closed = json.loads((logs / 'vk-independent-mcp-server.log').read_text().splitlines()[-1])
assert closed == dict(syntheticFriendCalls=0, messages=0, liveProvider=False, resourcesClosed=True)
names = [
    'experiments/issue-56/vk-independent-fixture.mjs',
    'experiments/issue-56/vk-independent-mcp.mjs',
    'experiments/issue-56/mcp-inspection-code.mjs',
    'experiments/issue-56/collect-vk-independent.py',
    'experiments/issue-56/evidence_bundle.py',
    'experiments/issue-56/audit-hosted-criteria.py',
    'js/tests/vk-independent-jobs.test.js',
    'js/tests/helpers/e2e-vk-independent.mjs',
    'js/tests/e2e-vk-independent-browser.mjs',
    'js/scripts/browser-checks.json', 'package.json',
    'docs/case-studies/issue-56/vk-independent-jobs.md',
    'ci-logs/vk-independent-mcp-code.js',
    'ci-logs/vk-desktop-reference-tree.json',
    'ci-logs/vk-desktop-reference-commit.json',
    'ci-logs/vk-desktop-reference-requirements.json',
    *evidence_logs(root, prefix),
    *[str(path.relative_to(root)) for path in (root / 'docs/screenshots/issue-56-vk-independent').glob('*.png')],
]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
tree = json.loads(entries['ci-logs/vk-desktop-reference-tree.json'])
assert tree['sha'] == '8fbf3b7c42fd8e995ef137cab9b9653a7dc9b1a1'
for filename, suffix in [('src/bot/config.js', 'config'), ('docs/REQUIREMENTS.md', 'requirements')]:
    name = f'ci-logs/vk-independent-reference-{suffix}.json' if suffix == 'config' else 'ci-logs/vk-desktop-reference-requirements.json'
    response = json.loads((root / name).read_text())
    content = base64.b64decode(response['content'])
    assert hashlib.sha1(b'blob ' + str(len(content)).encode() + b'\0' + content).hexdigest() == response['sha']
    assert any(row['path'] == filename and row['sha'] == response['sha'] for row in tree['tree'])
    entries[f'references/{filename}'] = content
entries['metadata.json'] = json.dumps(dict(
    parent=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root).decode().strip(),
    criterion='VD03', acceptance=False, policies=6, portableRuntimes=3,
    nativeEngine='chromium', acknowledgedToggles=12, liveProvider=False,
)).encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/vk-independent-jobs.tar.gz', entries)
