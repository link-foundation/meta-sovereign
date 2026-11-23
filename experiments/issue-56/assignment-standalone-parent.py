"""Compare standalone assignment support with the exact published parent."""

import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
PARENT = "a9491837cd571dccddc77dd8490e4bb683200103"
FILES = [
    *[f"js/src/assignments/{name}.js" for name in (
        "draft", "publish", "records", "restore", "source", "vacancy"
    )],
    "js/src/cli/help.js",
    "js/src/cli/test-assignment-command.js",
    "js/src/web/form-assignment-publisher.js",
    "js/src/web/form-assignment-publisher-api.js",
    "js/src/web/forms-view.js",
    *[f"js/src/web/locales/{language}-assignment.js" for language in ("en", "hi", "ru", "zh")],
]
NODE = ["node", "--max-old-space-size=384"]
BROWSER = "--browser" in sys.argv
if BROWSER:
    FILES.append("js/src/web/app.min.js")

saved = {name: (ROOT / name).read_bytes() for name in FILES}
try:
    for name in FILES:
        (ROOT / name).write_bytes(subprocess.check_output(
            ["git", "show", f"{PARENT}:{name}"], cwd=ROOT
        ))
    if BROWSER:
        subprocess.run(NODE + ["js/tests/e2e-forms-reader-browser.mjs"],
                       cwd=ROOT, check=True, env=dict(
                           os.environ,
                           RUN_BROWSER_E2E="1",
                           FORMS_STANDALONE_ONLY="1",
                           ASSIGNMENT_STANDALONE_BEFORE="1",
                           ASSIGNMENT_STANDALONE_SCREENSHOTS="1",
                       ))
    else:
        result = subprocess.run(NODE + [
            "--test", "--test-concurrency=1", "--test-reporter=tap",
            "--test-name-pattern=standalone assignment (retains|rejects|retries|lets|CLI|browser adapter)|assignment language override omitted",
            "js/tests/assignment-standalone.test.js",
            "js/tests/assignment-publisher.test.js",
        ], cwd=ROOT, check=False, text=True, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT)
        print(result.stdout, end="")
        if result.returncode != 1 or "# pass 1\n" not in result.stdout or "# fail 6\n" not in result.stdout:
            raise AssertionError("Expected six parent regressions and one passing legacy control")
finally:
    for name, content in saved.items():
        (ROOT / name).write_bytes(content)
    print("Actual parent comparison restored every changed source file.")
