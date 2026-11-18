"""Finite regressions against actual parent sources; always restore the draft."""

import os
from pathlib import Path
import subprocess

PARENT = "50021c333fb066a21a19de03c523529ad662a958"
ROOT = Path(__file__).resolve().parents[2]
FILES = [
    "js/src/sources/browser-choice-reader.js",
    "js/src/sources/browser-choice-controller.js",
    "js/src/sources/browser-choices.js",
    "js/src/sources/browser-sender.js",
    "js/src/sources/hh-web-ui.js",
]
saved = {name: (ROOT / name).read_bytes() for name in FILES}
env = {
    **os.environ,
    "NODE_OPTIONS": "--max-old-space-size=384",
    "HH_HISTORY_ONLY": "1",
    "HH_HISTORY_COLLECT_FAILURES": "1",
    "CHOICE_SCREENSHOTS": "docs/screenshots/issue-56-hh-browser-history/before",
}
try:
    for name in FILES:
        (ROOT / name).write_bytes(
            subprocess.check_output(["git", "show", f"{PARENT}:{name}"], cwd=ROOT)
        )
    for label, command in [
        (
            "node-before",
            ["node", "--test", "--test-concurrency=1", "--test-timeout=30000",
             "js/tests/browser-sender.test.js"],
        ),
        ("browser-before", ["node", "experiments/issue-56/hh-choices-browser.mjs"]),
    ]:
        log = ROOT / f"ci-logs/hh-browser-history-{label}.log"
        with log.open("wb") as output:
            result = subprocess.run(
                command, cwd=ROOT, env=env, stdout=output,
                stderr=subprocess.STDOUT, check=False,
            )
        assert result.returncode != 0, f"{label} unexpectedly passed"
        data = log.read_text()
        if label == "browser-before":
            assert data.count("[hh-choices] FAIL") == 5, data
            (ROOT / env["CHOICE_SCREENSHOTS"] / "hh-choices-history.png").replace(
                ROOT / "docs/screenshots/issue-56-hh-browser-history/before.png"
            )
        else:
            assert "readRecent retains text-free service barriers" in data
            assert "fail 1" in data
        print(f"{label}: expected actual-parent failures preserved in {log}")
finally:
    for name, content in saved.items():
        (ROOT / name).write_bytes(content)
