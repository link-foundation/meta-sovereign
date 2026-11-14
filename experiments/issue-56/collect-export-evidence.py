"""Collect this slice's bounded logs, fixture output and reference metadata."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

root = Path(__file__).resolve().parents[2]
stage = Path("/tmp/issue-56-telegram-export-evidence")
stage.mkdir(exist_ok=True)


def copy(source, destination):
    target = stage / destination
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


for path in (root / "ci-logs").glob("telegram-export-*.log"):
    copy(path, Path("logs") / path.name)
copy(root / "ci-logs/telegram-export-mcp.json", "browser/mcp.json")
for path in (root / "experiments/issue-56").glob("telegram-export-*"):
    if path.is_file():
        copy(path, Path("experiments") / path.name)
for path in Path("/tmp/issue-56-export-reviewed-output").rglob("*"):
    if path.is_file():
        copy(path, Path("reviewed-output") / path.relative_to("/tmp/issue-56-export-reviewed-output"))
copy("/tmp/issue-56-telegram-upstream.json", "research/upstream-15.json")
copy("/tmp/issue-56-ci-f42-jobs.json", "ci/f42-jobs-at-export-collection.json")
copy("/tmp/issue-56-ci-current.json", "ci/runs-at-export-collection.json")

reference = Path("/tmp/meta-sovereign-issue-56-references/konard--telegram-bot")
pins = {}
for name in ("README.md", "history-to-markdown.mjs"):
    pins[name] = {
        "url": "https://github.com/konard/telegram-bot/blob/715f937931c15810344c715e809aacf74f98912e/" + name,
        "sha256": hashlib.sha256((reference / name).read_bytes()).hexdigest(),
    }
(stage / "research/reference-files.json").write_text(json.dumps(pins, indent=2) + "\n")
changed = subprocess.check_output(["git", "diff", "--name-only"], cwd=root, text=True).splitlines()
new = subprocess.check_output(["git", "ls-files", "--others", "--exclude-standard"], cwd=root, text=True).splitlines()
hashes = {}
for name in sorted(set(changed + new)):
    path = root / name
    if path.is_file() and not name.endswith((".tar.gz", ".sha256.json")):
        hashes[name] = hashlib.sha256(path.read_bytes()).hexdigest()
(stage / "source-hashes.json").write_text(json.dumps(hashes, indent=2) + "\n")
(stage / "README.txt").write_text(
    "Final checks: window=12 pass; compatibility=12 pass; browser-final=Chrome pass; final-lint and target-lint pass; build/format pass.\n"
    "Before migration/mobile logs are intentional failures; after/comparison logs establish the correction. Draft lint preserves the initial review errors and is superseded by final lint.\n"
    "Reference code was inspected, never executed or copied. MCP fixture has explicit unrelated unsupported-method refusals. Browser-final is the full focused export flow.\n"
)
print(stage)
