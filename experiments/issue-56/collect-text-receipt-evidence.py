"""Archive bounded text-receipt regressions, observations and source hashes."""
from pathlib import Path
import hashlib
import io
import json
import subprocess
import tarfile

root = Path(__file__).resolve().parents[2]
logs = [str(p.relative_to(root)) for p in sorted((root / 'ci-logs').glob('telegram-text-receipts-*.log'))]
names = logs + [
    'ci-logs/telegram-text-receipts-mcp.json',
    'ci-logs/telegram-text-receipts-checkout-excerpt.txt',
    'experiments/issue-56/replay-text-receipts-before.py',
    'experiments/issue-56/telegram-text-receipts-ui.mjs',
    'experiments/issue-56/collect-text-receipt-evidence.py',
]
sources = subprocess.check_output(['git', 'diff', '--name-only'], cwd=root, text=True).splitlines()
sources += [
    'js/tests/telegram-text-receipts.test.js',
    'js/tests/helpers/telegram-text-receipts.mjs',
    'js/tests/e2e-telegram-text-receipts-browser.mjs',
    'docs/case-studies/issue-56/telegram-text-receipts.md',
    'docs/case-studies/issue-56/ci-checkout-fccb2648.md',
]
sources += [str(p.relative_to(root)) for p in sorted(root.glob('docs/case-studies/issue-56/screenshots/telegram-text-receipts-*.png'))]
metadata = {
    'base': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
    'checks': {'sender_account_receipts': 50, 'shared_ui': 22, 'browser': 'production Chromium and independent MCP desktop/mobile', 'lint_format_bundle': 'passed'},
    'limits': 'Bounded offline SDK-shaped clients, no live Telegram writes. Full matrices run in CI. Other open issue-wide criteria remain required.',
    'sources': {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in sorted(set(sources))},
}
archive = root / 'docs/case-studies/issue-56/data/telegram-text-receipts.tar.gz'
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
