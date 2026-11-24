"""Collect bounded TG03–TG05 evidence; external code is metadata only."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

root = Path(__file__).resolve().parents[2]
stage = Path("/tmp/issue-56-telegram-users-evidence")
stage.mkdir(exist_ok=True)


def copy(source, destination):
    target = stage / destination
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


for path in (root / "ci-logs").glob("telegram-chat-users-*.log"):
    copy(path, Path("logs") / path.name)
for name in ("telegram-users-ui.mjs", "write-users-locales.py", "update-users-ledger.py"):
    copy(root / "experiments/issue-56" / name, Path("experiments") / name)
copy("/tmp/issue-56-ci-export-latest.json", "ci/124a2234-runs.json")
copy("/tmp/issue-56-ci-export-jobs-final.json", "ci/124a2234-jobs.json")

reference = Path("/tmp/meta-sovereign-issue-56-references/konard--telegram-bot")
pins = {}
for name in ("README.md", "chat-users.mjs", "add-chat-users-to-contacts.mjs"):
    pins[name] = {
        "url": "https://github.com/konard/telegram-bot/blob/715f937931c15810344c715e809aacf74f98912e/" + name,
        "sha256": hashlib.sha256((reference / name).read_bytes()).hexdigest(),
    }
(stage / "reference-files.json").write_text(json.dumps(pins, indent=2) + "\n")
(stage / "mcp-observations.json").write_text(json.dumps({
    "method": "Independent Playwright MCP; actual production bundle and isolated fake-provider server",
    "before": "124a2234 export menu has no users/contact item",
    "after": {"users": 6, "participants": "partial: CHAT_ADMIN_REQUIRED", "messages": "complete", "eligible": 3, "selected": 2, "sharePhone": False},
    "mobile": {"viewport": [390, 844], "contentWidth": 390, "closeReachable": True, "addReachable": True},
    "writes": "Not applied in the manual flow; actual receipts and uncertainty are covered by production Chrome E2E",
    "console": "Unrelated unsupported fixture routes refuse explicitly; not a console-clean claim",
    "cleanup": "MCP browser closed and fixture stopped; screenshots independently validated as PNG and viewed",
}, indent=2) + "\n")
sdk = root / "node_modules/teleproto"
(stage / "sdk-contract.json").write_text(json.dumps({
    "version": json.loads((sdk / "package.json").read_text())["version"],
    "iteratorSha256": hashlib.sha256((sdk / "requestIter.js").read_bytes()).hexdigest(),
    "regression": "Finite installed RequestIter subclass: iterable has no next; open Symbol.asyncIterator first",
}, indent=2) + "\n")
changed = subprocess.check_output(["git", "diff", "--name-only"], cwd=root, text=True).splitlines()
new = subprocess.check_output(["git", "ls-files", "--others", "--exclude-standard"], cwd=root, text=True).splitlines()
hashes = {}
for name in sorted(set(changed + new)):
    path = root / name
    if path.is_file() and not name.endswith((".tar.gz", ".sha256.json")):
        hashes[name] = hashlib.sha256(path.read_bytes()).hexdigest()
(stage / "source-hashes.json").write_text(json.dumps(hashes, indent=2) + "\n")
(stage / "README.txt").write_text(
    "Final: 63 focused checks pass; browser-final Chrome passes; lint-final has zero warnings; web build and formatting pass.\n"
    "Before, iterator-before and peer-before logs are intentional draft/baseline failures; peer-before checks canonical typed input, not a proven SDK phone parsing defect.\n"
    "Initial lint logs preserve review warnings and are superseded by lint-final. Reference code was inspected only, never executed or copied.\n"
    "124a2234 full CI has Windows Deno rolling-host startup and WebKit older-birthday-fixture failures; separate investigation remains open.\n"
)
print(stage)
