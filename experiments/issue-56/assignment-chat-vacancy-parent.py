"""Replay isolated association checks and screenshots against the published source."""

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[2]
PARENT = "fc6bfaf09fd879681fc3d4d4eb87237a6a0b28a1"
NATIVE_PARENT = "cd0c7b25223e58a406e9c9c43896cee64a570b68"
FOCUSED = (
    "a form from the default HH|nested HH negotiation archives retain|"
    "an exact destination can associate|only the verified HH conversation|"
    "a remembered redirect no longer|chat vacancy inference supplies|"
    "vacancy URLs accept canonical"
)
NATIVE_FOCUSED = "verified native HH message|new complete native observation"
DRIVER = [
    "experiments/issue-56/assignment-chat-vacancy-fixture.mjs",
    "experiments/issue-56/forms-reader-fixture.mjs",
    "js/tests/assignment-vacancy.test.js",
    "js/tests/assignment-vacancy-draft.test.js",
    "js/tests/e2e-forms-reader-browser.mjs",
    "js/tests/helpers/e2e-assignment-chat-vacancy.mjs",
]
NATIVE_DRIVER = [
    "experiments/issue-56/assignment-native-chat-fixture.mjs",
    "js/tests/browser-history-archive.test.js",
    "js/tests/helpers/e2e-assignment-chat-vacancy.mjs",
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--browser", action="store_true")
    parser.add_argument("--native", action="store_true")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="assignment-chat-vacancy-parent-") as path:
        checkout = Path(path)
        parent = NATIVE_PARENT if args.native else PARENT
        with subprocess.Popen(
            ["git", "archive", parent, "package.json", "js/src", "js/tests", "experiments"],
            cwd=ROOT,
            stdout=subprocess.PIPE,
        ) as git:
            subprocess.run(["tar", "-xf", "-"], cwd=checkout, stdin=git.stdout, check=True)
            if git.wait() != 0:
                raise RuntimeError("Could not export the published parent")
        for file in NATIVE_DRIVER if args.native else DRIVER + NATIVE_DRIVER[:1]:
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
                               FORMS_ASSIGNMENT_NATIVE_CHAT="1" if args.native else "0",
                               FORMS_ASSIGNMENT_CHAT_PARENT="1",
                               FORMS_ASSIGNMENT_CHAT_SCREENSHOTS="1",
                           ))
            prefix = "native-" if args.native else ""
            screenshots = list(captures.glob(f"issue-56-assignment-{prefix}chat-vacancy-before-*.png"))
            if len(screenshots) != 2:
                raise AssertionError("Expected phone and desktop parent screenshots")
            for screenshot in screenshots:
                shutil.copyfile(screenshot, ROOT / "docs/screenshots" / screenshot.name)
        else:
            focused = NATIVE_FOCUSED if args.native else FOCUSED
            tests = ["js/tests/browser-history-archive.test.js"] if args.native else [
                "js/tests/assignment-vacancy.test.js",
                "js/tests/assignment-vacancy-draft.test.js",
            ]
            result = subprocess.run(node + [
                "--test", "--test-concurrency=1", "--test-reporter=tap",
                f"--test-name-pattern={focused}", *tests,
            ], cwd=checkout, check=False, text=True, stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT)
            print(result.stdout, end="")
            passing, failing = (0, 2) if args.native else (1, 6)
            if result.returncode != 1 or f"# pass {passing}\n" not in result.stdout or f"# fail {failing}\n" not in result.stdout:
                raise AssertionError(f"Expected {failing} parent regressions and {passing} passing controls")


if __name__ == "__main__":
    main()
