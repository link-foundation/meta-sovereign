"""Finite parent probes. Always restore the in-progress sources and UI bundle."""
from pathlib import Path
import subprocess

paths = [
    "js/src/automation/question-browser.js",
    "js/src/web/question-browser-api.js",
    "js/src/web/question-browser-controls.js",
    "js/src/web/app.min.js",
    "js/src/sources/browser-conversation-history.js",
]
saved = {path: Path(path).read_bytes() for path in paths}
try:
    for path in paths:
        Path(path).write_bytes(subprocess.check_output(["git", "show", f"08cff80a:{path}"]))
    with Path("ci-logs/question-unread-before-node.log").open("w") as log:
        result = subprocess.run([
            "node", "--test", "--test-concurrency=1",
            "--test-name-pattern=finite unread reviews|newest question is captured",
            "js/tests/question-browser-unread.test.js",
            "js/tests/browser-conversation-history.test.js",
        ], stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1
    with Path("ci-logs/question-unread-before-browser.log").open("w") as log:
        result = subprocess.run([
            "node", "experiments/issue-56/question-unread-review-browser.mjs", "--before",
        ], stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 0
finally:
    for path, body in saved.items():
        Path(path).write_bytes(body)
print("Restored all five working files after the finite actual-parent probes.")
