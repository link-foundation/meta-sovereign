"""Collect bounded, secret-free Telegram login lifecycle evidence."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
destination = Path(sys.argv[1])
destination.mkdir(parents=True, exist_ok=True)
files = [
    "ci-logs/telegram-login-lifecycle-before.log",
    "ci-logs/telegram-login-lifecycle-final.log",
    "ci-logs/telegram-login-lint-final.log",
    "ci-logs/checks-42726623365-lint-job.log",
    "ci-logs/ci-aab-ledger-format.log",
    "ci-logs/telegram-login-cli-terminal-before.log",
    "ci-logs/telegram-login-cli-final.log",
    "ci-logs/telegram-login-cli-lint.log",
    "ci-logs/telegram-login-complete.log",
    "ci-logs/telegram-login-ui-before.log",
    "ci-logs/telegram-login-ui-after.log",
    "ci-logs/telegram-login-ui-owner.log",
    "ci-logs/telegram-login-ui-lint.log",
    "ci-logs/telegram-login-ui-build.log",
    "ci-logs/telegram-login-qr-ui.log",
    "ci-logs/telegram-login-mcp-final.json",
    "ci-logs/checks-42727686505-deno-windows-job.log",
    "ci-logs/checks-42727686505-webkit-job.log",
    "experiments/issue-56/telegram-login-ui.mjs",
    "experiments/issue-56/collect-login-evidence.py",
]
for relative in files:
    source = root / relative
    target = destination / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
sources = [
    "js/src/sources/telegram-mtproto.js",
    "js/src/sources/telegram-phone-login.js",
    "js/src/sources/telegram-qr-login.js",
    "js/src/sources/telegram-login-lifecycle.js",
    "js/src/server/telegram-login-registry.js",
    "js/src/server/runtime-lifecycle.js",
    "js/src/server/routes-auto-import.js",
    "js/tests/telegram-login-lifecycle.test.js",
    "js/tests/telegram-login-registry.test.js",
    "js/tests/telegram-login-route.test.js",
    "js/src/cli/secret-prompt.js",
    "js/src/cli/telegram-login-commands.js",
    "js/src/sources/telegram-user-session.js",
    "js/tests/telegram-login-cli.test.js",
    "js/tests/telegram-storage-loading.test.js",
    "js/src/web/connections/telegram-login-owner.js",
    "js/src/web/connections/telegram-sessions.js",
    "js/src/web/connections/telegram-qr-login.js",
    "js/tests/telegram-login-owner.test.js",
    "js/tests/e2e-telegram-login-browser.mjs",
    "js/tests/helpers/telegram-login-fakes.mjs",
]
metadata = {
    "base": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip(),
    "reference": "konard/telegram-bot@715f937931c15810344c715e809aacf74f98912e",
    "sdk": json.loads((root / "node_modules/teleproto/package.json").read_text())["version"],
    "sources": {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in sources},
    "sdkSources": {
        name: hashlib.sha256((root / "node_modules/teleproto" / name).read_bytes()).hexdigest()
        for name in ["client/TelegramBaseClient.js", "client/methods/auth.js", "sessions/StringSession.js"]
    },
    "checks": {"baseline": "five lifecycle failures; terminal Ctrl+C wrong outcome; stale QR UI", "focused": "48 checks passed; production Chrome phone/finder and existing QR browser flows; independent MCP desktop/mobile", "lint": "passed"},
    "limits": "Fake clients only; no live Telegram authorization or full local runtime matrix.",
}
(destination / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
