"""Reproduce the missing Forms assignment issue on the previous source."""

import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
PARENT = "b9b07e5c88cb81b12b85db580fcaa95a3468d313"
FILES = [
    "js/src/forms/answer-plan.js",
    "js/src/forms/assignment-repository.js",
    "js/src/web/app.min.js",
    "js/src/web/form-assignment-publisher.js",
    "js/src/web/form-assignment.js",
    *[f"js/src/web/locales/{locale}-forms.js" for locale in ("en", "hi", "ru", "zh")],
]

saved = {name: (ROOT / name).read_bytes() for name in FILES}
try:
    for name in FILES:
        (ROOT / name).write_bytes(subprocess.check_output(
            ["git", "show", f"{PARENT}:{name}"], cwd=ROOT
        ))
    result = subprocess.run(
        ["node", "--max-old-space-size=384", "js/tests/e2e-forms-reader-browser.mjs"],
        cwd=ROOT, check=False, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        env=dict(os.environ, RUN_BROWSER_E2E="1", FORMS_PUBLICATION_ONLY="1",
                 ASSIGNMENT_HANDOFF_BEFORE="1"),
    )
    print(result.stdout, end="")
    if result.returncode != 1 or "reopened plan carries the exact confirmed issue" not in result.stdout:
        raise AssertionError("Expected the reopened plan to lose the confirmed issue")
finally:
    for name, content in saved.items():
        (ROOT / name).write_bytes(content)
