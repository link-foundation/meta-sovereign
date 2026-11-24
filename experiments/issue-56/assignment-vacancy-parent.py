"""Reproduce numeric vacancy and private-prose failures on the published parent."""

import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
PARENT = "9167a0d5fa22a75cea66e2e9011313ea54cab4e8"
NODE = ["node", "--max-old-space-size=384"]
FILES = [
    *[f"js/src/assignments/{name}.js" for name in (
        "draft", "publish", "records", "source", "vacancy", "validation"
    )],
    "js/src/cli/test-assignment-command.js",
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
                           ASSIGNMENT_VACANCY_BEFORE="1",
                           ASSIGNMENT_VACANCY_SCREENSHOTS="1",
                       ))
    else:
        result = subprocess.run(NODE + [
            "--test", "--test-concurrency=1", "--test-reporter=tap",
            "--test-name-pattern=assignment vacancy draft|vacancy URLs accept canonical",
            "js/tests/assignment-vacancy.test.js",
            "js/tests/assignment-vacancy-draft.test.js",
        ], cwd=ROOT, check=False, text=True, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT)
        print(result.stdout, end="")
        if result.returncode != 1 or "# pass 1\n" not in result.stdout or "# fail 6\n" not in result.stdout:
            raise AssertionError("Expected six parent regressions and one passing legacy control")
finally:
    for name, content in saved.items():
        (ROOT / name).write_bytes(content)
    print("Actual parent comparison restored every changed source file.")
