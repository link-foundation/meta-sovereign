"""Compare bounded assignment language checks against the exact published parent."""

import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
PARENT = "92efe0f04f804e64cca23486c18d0f93cc64cdea"
FILES = [
    "js/src/assignments/draft.js",
    "js/src/assignments/records.js",
    "js/src/assignments/templates.js",
    "js/src/cli/help.js",
    "js/src/cli/test-assignment-command.js",
    "js/src/web/form-assignment-publisher.js",
    "js/src/web/form-assignment-publisher-api.js",
    *[f"js/src/web/locales/{language}-assignment.js" for language in ["en", "hi", "ru", "zh"]],
]

browser = "--browser" in sys.argv
if browser:
    FILES.append("js/src/web/app.min.js")
saved = {name: (ROOT / name).read_bytes() for name in FILES}
try:
    for name in FILES:
        (ROOT / name).write_bytes(subprocess.check_output(
            ["git", "show", f"{PARENT}:{name}"], cwd=ROOT
        ))
    if browser:
        result = subprocess.run(
            ["node", "--max-old-space-size=384", "js/tests/e2e-forms-reader-browser.mjs"],
            cwd=ROOT,
            env=dict(
                os.environ,
                RUN_BROWSER_E2E="1",
                FORMS_PUBLICATION_ONLY="1",
                ASSIGNMENT_LANGUAGE_BEFORE="1",
                ASSIGNMENT_LANGUAGE_SCREENSHOTS="1",
            ),
            check=False,
        )
        if result.returncode:
            raise SystemExit(result.returncode)
    else:
        result = subprocess.run([
            "node", "--max-old-space-size=384", "--test", "--test-concurrency=1",
            "--test-name-pattern=assignment language override",
            "js/tests/assignment-publisher.test.js",
            "js/tests/assignment-publication-controls.test.js",
        ], cwd=ROOT, check=False)
        if result.returncode != 1:
            raise AssertionError("The exact parent must fail the override regressions")
finally:
    for name, content in saved.items():
        (ROOT / name).write_bytes(content)
    print("Actual parent comparison restored every changed source file.")
