"""Collect finite, credential-free TG09/TG10 evidence and verify its archive."""
from pathlib import Path
import hashlib
import io
import json
import subprocess
import tarfile

root = Path(__file__).resolve().parents[2]
names = [
    'ci-logs/telegram-chat-users-startup-before.log',
    'ci-logs/telegram-group-greetings-focused-test.log',
    'ci-logs/telegram-group-greetings-ui-test.log',
    'ci-logs/telegram-group-greetings-integration-test.log',
    'ci-logs/telegram-group-greetings-lint.log',
    'ci-logs/telegram-group-greetings-final-format.log',
    'ci-logs/telegram-group-greetings-build-web.log',
    'ci-logs/telegram-group-greetings-browser-before.log',
    'ci-logs/telegram-group-greetings-browser-after.log',
    'experiments/issue-56/replay-users-startup-before.py',
    'experiments/issue-56/telegram-group-greeting-ui.mjs',
    'experiments/issue-56/collect-group-greeting-evidence.py',
    'experiments/issue-56/update-group-greeting-ledger.py',
]
sources = [str(p.relative_to(root)) for pattern in [
    'js/src/sources/telegram-group-greet*.js',
    'js/src/sources/telegram-chat-users*.js',
    'js/src/web/telegram-group-greet*.js',
    'js/src/web/locales/*-telegram-greetings.js',
    'js/tests/*telegram-group-greet*',
    'docs/case-studies/issue-56/screenshots/telegram-group-greetings-*.png',
] for p in sorted(root.glob(pattern))]
sources += [
    'js/src/cli/telegram-group-greeting-commands.js',
    'js/src/sources/telegram-greeting-transport.js',
    'js/src/server/routes-telegram-chat-users.js',
    'js/src/server/telegram-capabilities.js',
    'js/src/web/dom-telegram-calls.js',
    'js/src/web/telegram-greeting-tools.js',
    'js/src/web/app.css',
    'js/src/cli/telegram-greetings-commands.js',
    'js/scripts/browser-checks.json',
    'js/tests/helpers/group-greeting-fakes.mjs',
    'js/tests/telegram-chat-users-startup.test.js',
    'js/tests/telegram-chat-users.test.js',
    'package.json',
]
metadata = {
    'base': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
    'sdk': json.loads((root / 'node_modules/teleproto/package.json').read_text())['version'],
    'checks': {'focused': 70, 'ui': 43, 'existing_integration': 38, 'browser': 'production Chromium and independent MCP desktop/mobile', 'lint_format_bundle': 'passed'},
    'limits': 'Offline bounded SDK fakes; Telegram exposes visible business configuration only. Full runtime/browser matrices run in CI. All other open issue-wide criteria remain required.',
    'sources': {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in sources},
}
data = root / 'docs/case-studies/issue-56/data'
archive = data / 'telegram-group-greetings.tar.gz'
metadata_bytes = (json.dumps(metadata, indent=2) + '\n').encode()
with tarfile.open(archive, 'w:gz') as tar:
    for name in names:
        tar.add(root / name, arcname=name)
    info = tarfile.TarInfo('metadata.json')
    info.size = len(metadata_bytes)
    tar.addfile(info, io.BytesIO(metadata_bytes))
with tarfile.open(archive, 'r:gz') as tar:
    hashes = {item.name: hashlib.sha256(tar.extractfile(item).read()).hexdigest() for item in tar.getmembers() if item.isfile()}
assert set(hashes) == set(names) | {'metadata.json'}
for name in names:
    assert hashes[name] == hashlib.sha256((root / name).read_bytes()).hexdigest()
(data / 'telegram-group-greetings.tar.sha256.json').write_text(json.dumps({'archive': archive.name, 'files': hashes}, indent=2) + '\n')
print(f'Verified {len(hashes)} archived files and {len(sources)} source/image hashes')
