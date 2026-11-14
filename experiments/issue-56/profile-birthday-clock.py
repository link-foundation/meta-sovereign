"""Reproduce the real-clock birthday fixture at 00:00:05, then run fixed noon.

Only this isolated fixture's clock is controlled. Product birthday matching is
unchanged and correctly excludes yesterday's wishes. Source is restored even
when the intentional baseline assertion fails.
"""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
test = root / "js/tests/e2e-profile-extras-browser.mjs"
original = test.read_bytes()
baseline = subprocess.check_output(
    ["git", "show", "124a2234:js/tests/e2e-profile-extras-browser.mjs"],
    cwd=root, text=True,
)
baseline = baseline.replace("const today = new Date();", "const today = new Date(2026, 10, 10, 0, 0, 5);")
baseline = baseline.replace("Date.now()", "today.getTime()")
baseline = baseline.replace("timestamp: new Date().toISOString()", "timestamp: today.toISOString()")
baseline = baseline.replace("await page.addInitScript", "await page.clock.setFixedTime(today);\nawait page.addInitScript", 1)
env = {**os.environ, "RUN_BROWSER_E2E": "1", "E2E_BROWSER": "chromium",
       "E2E_EXECUTABLE_PATH": "/usr/bin/google-chrome",
       "E2E_ARTIFACT_DIR": str(root / "ci-logs/ci-124-birthday-before")}
command = ["node", "js/tests/e2e-profile-extras-browser.mjs"]
try:
    test.write_text(baseline)
    with (root / "ci-logs/ci-124-birthday-before.log").open("w") as output:
        before = subprocess.run(command, cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT)
finally:
    test.write_bytes(original)
env["E2E_ARTIFACT_DIR"] = str(root / "ci-logs/ci-124-birthday-after")
with (root / "ci-logs/ci-124-birthday-after.log").open("w") as output:
    after = subprocess.run(command, cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT)
assert before.returncode != 0, "Midnight baseline unexpectedly passed"
assert after.returncode == 0, "Fixed-calendar fixture did not pass"
print(f"PASS: baseline {before.returncode}; fixed {after.returncode}; fixture restored")
