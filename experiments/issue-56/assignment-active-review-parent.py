"""Replay active Forms assignment regressions on the published parent."""

import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
PARENT = "be57b27a8791d1369a790429db8ce435ced91c86"
NODE = ["node", "--max-old-space-size=384"]
FILES = [
    "js/src/assignments/service.js",
    "js/src/cli/test-assignment-command.js",
    "js/src/forms/reader.js",
    "js/src/forms/review-sessions.js",
    "js/src/web/form-assignment-publisher.js",
    "js/src/web/form-assignment-publisher-api.js",
]
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
                           FORMS_PUBLICATION_ONLY="1",
                           ASSIGNMENT_ACTIVE_REVIEW_BEFORE="1",
                           ASSIGNMENT_ACTIVE_REVIEW_SCREENSHOTS="1",
                       ))
    else:
        result = subprocess.run(NODE + [
            "--test", "--test-concurrency=1", "--test-reporter=tap",
            "js/tests/assignment-active-review.test.js",
        ], cwd=ROOT, check=False, text=True, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT)
        print(result.stdout, end="")
        if result.returncode != 1 or "# fail 4\n" not in result.stdout:
            raise AssertionError("Expected four active Forms assignment regressions")
finally:
    for name, content in saved.items():
        (ROOT / name).write_bytes(content)
    print("Actual parent comparison restored every changed source file.")
