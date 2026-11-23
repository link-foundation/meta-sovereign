"""Replay isolated association checks and screenshots against the published source."""

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[2]
PARENT = "fc6bfaf09fd879681fc3d4d4eb87237a6a0b28a1"
FOCUSED = (
    "a form from the default HH|nested HH negotiation archives retain|"
    "an exact destination can associate|only the verified HH conversation|"
    "a remembered redirect no longer|chat vacancy inference supplies|"
    "vacancy URLs accept canonical"
)
DRIVER = [
    "experiments/issue-56/assignment-chat-vacancy-fixture.mjs",
    "experiments/issue-56/forms-reader-fixture.mjs",
    "js/tests/assignment-vacancy.test.js",
    "js/tests/assignment-vacancy-draft.test.js",
    "js/tests/e2e-forms-reader-browser.mjs",
    "js/tests/helpers/e2e-assignment-chat-vacancy.mjs",
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--browser", action="store_true")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="assignment-chat-vacancy-parent-") as path:
        checkout = Path(path)
        with subprocess.Popen(
            ["git", "archive", PARENT, "package.json", "js/src", "js/tests", "experiments"],
            cwd=ROOT,
            stdout=subprocess.PIPE,
        ) as git:
            subprocess.run(["tar", "-xf", "-"], cwd=checkout, stdin=git.stdout, check=True)
            if git.wait() != 0:
                raise RuntimeError("Could not export the published parent")
        for file in DRIVER:
            shutil.copyfile(ROOT / file, checkout / file)
        (checkout / "node_modules").symlink_to(ROOT / "node_modules", target_is_directory=True)
        node = ["node", "--max-old-space-size=384"]
        if args.browser:
            captures = checkout / "docs/screenshots"
            captures.mkdir(parents=True)
            subprocess.run(node + ["js/tests/e2e-forms-reader-browser.mjs"],
                           cwd=checkout, check=True, env=dict(
                               os.environ,
                               RUN_BROWSER_E2E="1",
                               FORMS_ASSIGNMENT_CHAT_ONLY="1",
                               FORMS_ASSIGNMENT_CHAT_PARENT="1",
                               FORMS_ASSIGNMENT_CHAT_SCREENSHOTS="1",
                           ))
            screenshots = list(captures.glob("issue-56-assignment-chat-vacancy-before-*.png"))
            if len(screenshots) != 2:
                raise AssertionError("Expected phone and desktop parent screenshots")
            for screenshot in screenshots:
                shutil.copyfile(screenshot, ROOT / "docs/screenshots" / screenshot.name)
        else:
            result = subprocess.run(node + [
                "--test", "--test-concurrency=1", "--test-reporter=tap",
                f"--test-name-pattern={FOCUSED}",
                "js/tests/assignment-vacancy.test.js",
                "js/tests/assignment-vacancy-draft.test.js",
            ], cwd=checkout, check=False, text=True, stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT)
            print(result.stdout, end="")
            if result.returncode != 1 or "# pass 1\n" not in result.stdout or "# fail 6\n" not in result.stdout:
                raise AssertionError("Expected six parent regressions and one passing control")


if __name__ == "__main__":
    main()
