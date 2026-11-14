"""Preserve focused discovery checks, research and source/image hashes."""
from pathlib import Path
import hashlib
import io
import json
import subprocess
import tarfile

root = Path(__file__).resolve().parents[2]
names = [str(p.relative_to(root)) for p in sorted((root / 'ci-logs').glob('follow-chats-*.log'))]
names += [
    'ci-logs/follow-chats-mcp.json',
    'ci-logs/follow-chats-vk-schema-head.txt',
    'ci-logs/vk-messages-methods.json',
    'ci-logs/vk-messages-objects.json',
    'ci-logs/follow-chats-pr33.json',
    'ci-logs/follow-chats-pr34.json',
    'ci-logs/follow-chats-related-prs.json',
    'experiments/issue-56/follow-chats-ui.mjs',
    'experiments/issue-56/collect-follow-chat-evidence.py',
]
sources = subprocess.check_output(['git', 'diff', '--name-only'], cwd=root, text=True).splitlines()
sources += subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], cwd=root, text=True).splitlines()
sources = sorted({n for n in sources if not n.endswith(('.tar.gz', '.sha256.json'))})
metadata = {
    'base': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
    'checks': {'focused': 46, 'browser': 'production Chromium; independent MCP desktop/mobile', 'lint_format_secrets_bundle': 'passed'},
    'research': {'follow': 'af8fbb80cec26a7b5b205c93314372d1d92cec1f', 'vk_schema': '333481bd082ad747d4873ef4a77f9247097eeef0', 'method': 'static; upstream code not executed'},
    'regression': 'Incomplete successful HTTP pagination metadata was accepted before the guard; focused check fails before and passes after.',
    'limits': 'Isolated stores and offline provider-shaped fixtures. No live VK requests or writes. Full matrices in CI. FL03–FL09 and other issue-wide criteria remain open.',
    'sources': {n: hashlib.sha256((root / n).read_bytes()).hexdigest() for n in sources},
}
archive = root / 'docs/case-studies/issue-56/data/follow-chats.tar.gz'
payload = (json.dumps(metadata, indent=2) + '\n').encode()
with tarfile.open(archive, 'w:gz') as tar:
    for name in names:
        tar.add(root / name, arcname=name)
    entry = tarfile.TarInfo('metadata.json')
    entry.size = len(payload)
    tar.addfile(entry, io.BytesIO(payload))
with tarfile.open(archive, 'r:gz') as tar:
    hashes = {entry.name: hashlib.sha256(tar.extractfile(entry).read()).hexdigest() for entry in tar.getmembers() if entry.isfile()}
assert set(hashes) == set(names) | {'metadata.json'}
for name in names:
    assert hashes[name] == hashlib.sha256((root / name).read_bytes()).hexdigest()
archive.with_suffix('').with_suffix('.tar.sha256.json').write_text(json.dumps({'archive': archive.name, 'files': hashes}, indent=2) + '\n')
print(f'Verified {len(hashes)} archive entries and {len(metadata["sources"])} source/image hashes')
