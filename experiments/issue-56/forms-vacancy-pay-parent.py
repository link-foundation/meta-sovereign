"""Run the pay regressions or phone screenshot on the exact published parent."""

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[2]
PARENT = "e90c2d02ca881108bd56aa07074626c8c6a5cbde"
FIXTURES = [
    "experiments/issue-56/forms-pay-fixture.mjs",
    "experiments/issue-56/forms-reader-fixture.mjs",
    "js/tests/e2e-forms-reader-browser.mjs",
    "js/tests/forms-pay-guidance.test.js",
    "js/tests/helpers/e2e-form-pay.mjs",
]
SCREENSHOT = "docs/screenshots/issue-56-forms-vacancy_pay-before-mobile.png"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--browser", action="store_true")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="forms-vacancy-pay-parent-") as path:
        checkout = Path(path)
        with subprocess.Popen(
            ["git", "archive", PARENT, "package.json", "js/src", "js/tests", "experiments"],
            cwd=ROOT, stdout=subprocess.PIPE,
        ) as archive:
            subprocess.run(["tar", "-xf", "-"], cwd=checkout, stdin=archive.stdout, check=True)
            if archive.wait() != 0:
                raise RuntimeError("Could not export the published parent")
        (checkout / "node_modules").symlink_to(ROOT / "node_modules", target_is_directory=True)
        for file in FIXTURES:
            shutil.copyfile(ROOT / file, checkout / file)
        if args.browser:
            (checkout / "docs/screenshots").mkdir(parents=True)
            subprocess.run(["node", "--max-old-space-size=384", "js/tests/e2e-forms-reader-browser.mjs"],
                           cwd=checkout, check=True, env=dict(
                               os.environ, RUN_BROWSER_E2E="1", FORMS_VACANCY_PAY_ONLY="1",
                               FORMS_VACANCY_PAY_SCREENSHOTS="1", FORMS_VACANCY_PAY_PARENT="1",
                           ))
            shutil.copyfile(checkout / SCREENSHOT, ROOT / SCREENSHOT)
        else:
            result = subprocess.run(["node", "--test", "--test-concurrency=1", "--test-reporter=tap",
                                     "js/tests/forms-pay-guidance.test.js"], cwd=checkout, check=False,
                                    text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            print(result.stdout, end="")
            if result.returncode != 1 or "# pass 9\n" not in result.stdout or "# fail 4\n" not in result.stdout:
                raise AssertionError("Expected four regressions and nine passing controls")


if __name__ == "__main__":
    main()
