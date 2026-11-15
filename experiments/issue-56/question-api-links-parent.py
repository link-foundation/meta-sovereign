"""Finite actual-parent comparison; always restore this task's source changes."""
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
PARENT = "d34db92c18886e741c91af906d2d2a975c0c14c6"
FILES = [
    "js/src/automation/planning-store.js",
    "js/src/automation/question-chat-turn.js",
    "js/src/automation/question-store.js",
    "js/src/sources/telegram.js",
    "js/src/cli/automation-commands.js",
]
kind = "api"
if "--email" in sys.argv:
    kind = "email"
    PARENT = "7ba65f1e1f511aa307a2765f7c296a3e88cdf851"
    FILES = [f"js/src/sources/{name}.js" for name in [
        "message-text-links", "email-html", "email-mime", "email-records"]]
if "--browser" in sys.argv:
    FILES.append("js/src/web/app.min.js")
saved = {name: (ROOT / name).read_bytes() for name in FILES}
try:
    for name in FILES:
        (ROOT / name).write_bytes(subprocess.check_output(
            ["git", "show", f"{PARENT}:{name}"], cwd=ROOT
        ))
    if "--browser" in sys.argv:
        result = subprocess.run([
            "node", "--max-old-space-size=384",
            f"experiments/issue-56/question-{kind}-links-browser.mjs", "--before",
        ], cwd=ROOT, check=False)
        if result.returncode:
            raise SystemExit(result.returncode)
    else:
        result = subprocess.run([
            "node", "--max-old-space-size=384", "--test", "--test-concurrency=1",
            f"js/tests/question-{kind}-links.test.js",
        ], cwd=ROOT, check=False)
        if result.returncode != 1:
            raise AssertionError("The parent regression checks must fail")
finally:
    for name, content in saved.items():
        (ROOT / name).write_bytes(content)
    print("Actual parent source comparison restored every changed source file.")
