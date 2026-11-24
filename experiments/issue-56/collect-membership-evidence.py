"""Preserve bounded membership regressions, browser checks and research."""
from pathlib import Path
import hashlib
import io
import json
import subprocess
import tarfile

root = Path(__file__).resolve().parents[2]
names = [str(p.relative_to(root)) for p in sorted((root / 'ci-logs').glob('telegram-membership-*.log'))]
names += [
    'ci-logs/telegram-membership-mcp.json',
    'ci-logs/issue-56-latest.json',
    'ci-logs/issue-56-sub-issues-latest.json',
    'ci-logs/membership-issue-comments.json',
    'ci-logs/membership-pr-comments.json',
    'ci-logs/membership-pr-inline.json',
    'ci-logs/membership-pr-reviews.json',
    'experiments/issue-56/telegram-membership-ui.mjs',
    'experiments/issue-56/collect-membership-evidence.py',
]
for number in [9, 10, 12, 14, 16]:
    names.extend(f'ci-logs/follow-pr{number}{suffix}.json' for suffix in ['', '-comments', '-inline', '-reviews'])
sources = subprocess.check_output(['git', 'diff', '--name-only'], cwd=root, text=True).splitlines()
sources += subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], cwd=root, text=True).splitlines()
sources = sorted({n for n in sources if not n.endswith(('.tar.gz', '.sha256.json'))})
metadata = {
    'base': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
    'checks': {'failing_before': 6, 'focused': 60, 'browser': ['membership-receipts', 'invite-link', 'pinned-list'], 'engine': 'Chromium', 'mcp': 'independent desktop/mobile', 'lint_format_secrets_bundle': 'passed'},
    'research': {'follow': 'af8fbb80cec26a7b5b205c93314372d1d92cec1f', 'method': 'Static upstream source/PR review; no upstream execution', 'required_sub_issues': []},
    'limits': 'Offline RPC fixtures; no live Telegram calls. Full CI matrix required. Complete FL03/FL05 workflow, FL04/FL06–09 and other issue-wide work remain unfinished.',
    'sources': {n: hashlib.sha256((root / n).read_bytes()).hexdigest() for n in sources},
}
archive = root / 'docs/case-studies/issue-56/data/telegram-membership.tar.gz'
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
