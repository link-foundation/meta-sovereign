"""Preserve the exact-head failure and bounded platform diagnosis."""
from pathlib import Path
import shutil
import sys

root = Path(__file__).resolve().parents[2]
destination = Path(sys.argv[1])
for relative in [
    "ci-logs/checks-42735153273.log",
    "ci-logs/checks-42735153273.json",
    "ci-logs/ci-catalog-signal-linux-deno.log",
    "ci-logs/ci-catalog-signal-node.log",
    "ci-logs/ci-catalog-signal-deno.log",
    "ci-logs/ci-catalog-signal-lint.log",
    "ci-logs/ci-catalog-signal-format.log",
    "experiments/issue-56/telegram-cli-signals.mjs",
    "experiments/issue-56/collect-catalog-signal-evidence.py",
    "js/tests/telegram-greeting-stickers-cli.test.js",
]:
    target = destination / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(root / relative, target)
for name in ["issue-56-deno-process.ts", "issue-56-deno-signals-26331.json"]:
    shutil.copyfile(Path("/tmp") / name, destination / name)
