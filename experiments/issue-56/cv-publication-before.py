"""Run the finite public-service regression with the exact published service."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
service = root / "js/src/jobs/service.js"
current = service.read_bytes()
parent = subprocess.check_output(["git", "show", "4c06685a:js/src/jobs/service.js"], cwd=root)
log = root / "ci-logs/cv-publication-before.log"
try:
    service.write_bytes(parent)
    with log.open("wb") as output:
        result = subprocess.run([
            "node", "--test", "--test-concurrency=1",
            "--test-name-pattern=publication commits only sanitized",
            "js/tests/cv-publication.test.js",
        ], cwd=root, env={**os.environ, "NODE_OPTIONS": "--max-old-space-size=384"}, stdout=output, stderr=subprocess.STDOUT)
    assert result.returncode != 0, "The published parent unexpectedly implemented publication"
    assert "f.service.cv-publish-plan is not a function" in log.read_text() or "f.service[\"cv-publish-plan\"] is not a function" in log.read_text()
finally:
    service.write_bytes(current)
print("Exact 4c06685a public service refused the missing operation; current source restored.")
