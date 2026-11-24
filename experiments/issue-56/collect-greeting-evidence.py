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
    "ci-logs/telegram-greeting-ui-unit.log",
    "ci-logs/telegram-greeting-ui-browser-before.log",
    "ci-logs/telegram-greeting-ui-browser-after.log",
    "ci-logs/telegram-greeting-ui-lint.log",
    "ci-logs/telegram-greeting-ui-build.log",
    "ci-logs/telegram-greeting-ui-format.log",
    "ci-logs/telegram-greeting-send-guard-before.log",
    "ci-logs/telegram-greeting-send-guard-after.log",
    "ci-logs/telegram-greeting-send-final-test.log",
    "ci-logs/telegram-greeting-send-ui-unit.log",
    "ci-logs/telegram-greeting-send-compatibility.log",
    "ci-logs/telegram-greeting-send-lint.log",
    "ci-logs/telegram-greeting-send-build.log",
    "ci-logs/telegram-greeting-send-format.log",
    "ci-logs/telegram-greeting-send-browser-before.log",
    "ci-logs/telegram-greeting-send-browser-after.log",
    "ci-logs/telegram-greeting-send-browser-launch.log",
    "experiments/issue-56/telegram-mask-shape.mjs",
    "experiments/issue-56/telegram-greeting-ui.mjs",
    "experiments/issue-56/collect-greeting-evidence.py",
    "experiments/issue-56/update-greeting-ledger.py",
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
    "js/src/web/telegram-greeting-catalog.js",
    "js/src/web/telegram-greeting-catalog-model.js",
    "js/src/web/app.css",
    "js/scripts/browser-checks.json",
    "package.json",
    "js/tests/telegram-greeting-catalog-model.test.js",
    "js/tests/e2e-telegram-greeting-catalog-browser.mjs",
    "docs/case-studies/issue-56/telegram-catalog-before.png",
    "docs/case-studies/issue-56/telegram-catalog-after.png",
    "docs/case-studies/issue-56/telegram-catalog-mobile.png",
    "docs/case-studies/issue-56/telegram-catalog-mobile-results.png",
    "js/src/sources/telegram-greeting-send.js",
    "js/src/sources/telegram-greeting-delivery.js",
    "js/src/sources/telegram-greeting-target.js",
    "js/src/sources/telegram-greeting-transport.js",
    "js/src/cli/telegram-greeting-send-commands.js",
    "js/src/web/telegram-greeting-tools.js",
    "js/src/web/telegram-greeting-send-model.js",
    "js/tests/telegram-greeting-send.test.js",
    "js/tests/telegram-greeting-send-cli.test.js",
    "js/tests/telegram-greeting-send-api.test.js",
    "js/tests/telegram-greeting-send-model.test.js",
    "js/tests/telegram-sticker-send-guard.test.js",
    "js/tests/helpers/greeting-send-fakes.mjs",
    "js/tests/e2e-telegram-greeting-send-browser.mjs",
] + [str(path.relative_to(root)) for path in sorted((root / "js/src/sources").glob("telegram-greeting-stickers*.js"))] + [str(path.relative_to(root)) for path in sorted((root / "js/src/web/locales").glob("*-telegram-greetings.js"))]
sources += [str(path.relative_to(root)) for path in sorted((root / "docs/case-studies/issue-56/screenshots").glob("telegram-greeting-send-*.png"))]
metadata = {
    "base": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip(),
    "reference": "konard/telegram-bot@715f937931c15810344c715e809aacf74f98912e",
    "sdk": json.loads((root / "node_modules/teleproto/package.json").read_text())["version"],
    "sources": {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in sources},
    "checks": {"baseline": "empty sticker RPC incorrectly accepted; catalog and send controls absent; internal pre-write guard ignored", "receipts": "35 passing focused checks", "catalog": "19 passing focused checks plus existing capability/account checks", "catalog_ui": "44 focused checks, production Chromium and independent MCP desktop/mobile", "reviewed_sends": "53 focused core, 45 model/Greetings/locale and 57 existing compatibility checks; production Chromium and independent MCP desktop/mobile", "lint_format_build": "passed"},
    "limits": "Offline SDK fakes and one finite installed-SDK schema probe. TG09/TG10 participant eligibility, group limits, pacing and acknowledged progress remain unfinished. Full browser/runtime matrices run in CI. Initial browser launch failed due to a missing downloaded binary; reruns use existing Chrome without installing a browser.",
    "upstream": "https://github.com/konard/telegram-bot/issues/16",
}
(destination / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
