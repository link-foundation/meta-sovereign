"""Run the new admission contract against the actual parent service, then restore."""

import os
from pathlib import Path
import subprocess


root = Path(__file__).resolve().parents[2]
service = root / "js/src/automation/question-browser.js"
original = service.read_bytes()
parent = subprocess.check_output(["git", "show", "9ca1c997:js/src/automation/question-browser.js"], cwd=root)
logs = root / "ci-logs"
logs.mkdir(exist_ok=True)
(logs / "question-text-parent-service.js").write_bytes(parent)
try:
    service.write_bytes(parent)
    with (logs / "question-text-before.log").open("w") as output:
        result = subprocess.run(
            ["node", "--test", "--test-concurrency=1", "--test-timeout=20000", "--test-name-pattern=reviewed text requires", "js/tests/question-browser-text.test.js"],
            cwd=root, env={**os.environ, "NODE_OPTIONS": "--max-old-space-size=384"},
            stdout=output, stderr=subprocess.STDOUT, check=False,
        )
    if result.returncode == 0:
        raise RuntimeError("The actual parent unexpectedly passed text admission")
finally:
    service.write_bytes(original)
print("Actual parent fails the new reviewed-text admission contract; service restored.")
