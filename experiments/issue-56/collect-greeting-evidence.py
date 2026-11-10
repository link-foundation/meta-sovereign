"""Collect bounded, credential-free Telegram receipt/catalog evidence."""
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
    "ci-logs/telegram-greetings-receipt-before.log",
    "ci-logs/telegram-greetings-receipt-after.log",
    "ci-logs/telegram-greetings-receipt-lint.log",
    "ci-logs/telegram-greeting-catalog-final-test.log",
    "ci-logs/telegram-greeting-catalog-final-lint.log",
    "ci-logs/telegram-greeting-catalog-final-format.log",
    "ci-logs/telegram-mask-shape.json",
    "ci-logs/telegram-mask-upstream-issue.txt",
    "experiments/issue-56/telegram-mask-shape.mjs",
    "experiments/issue-56/collect-greeting-evidence.py",
]
for relative in files:
    target = destination / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(root / relative, target)
sources = [
    "js/src/sources/telegram-message-receipt.js",
    "js/src/sources/telegram-stickers.js",
    "js/src/cli/telegram-greetings-commands.js",
    "js/src/server/routes-telegram-chat-users.js",
    "js/src/server/telegram-capabilities.js",
    "js/tests/telegram-message-receipt.test.js",
    "js/tests/telegram-greeting-stickers.test.js",
    "js/tests/telegram-greeting-stickers-cli.test.js",
    "js/tests/telegram-greeting-stickers-api.test.js",
    "js/tests/helpers/greeting-stickers-fakes.mjs",
] + [str(path.relative_to(root)) for path in sorted((root / "js/src/sources").glob("telegram-greeting-stickers*.js"))]
metadata = {
    "base": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip(),
    "reference": "konard/telegram-bot@715f937931c15810344c715e809aacf74f98912e",
    "sdk": json.loads((root / "node_modules/teleproto/package.json").read_text())["version"],
    "sources": {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in sources},
    "checks": {"baseline": "resolved empty sticker RPC incorrectly accepted", "receipts": "35 passing focused checks", "catalog": "19 passing focused checks plus existing capability/account checks", "lint": "passed"},
    "limits": "Offline SDK fakes and one finite installed-SDK schema probe. Catalog UI, bot startup and participant greeting workflows remain unfinished.",
    "upstream": "https://github.com/konard/telegram-bot/issues/16",
}
(destination / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
