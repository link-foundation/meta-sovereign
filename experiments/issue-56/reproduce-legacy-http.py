"""Run the current small HTTP regression against a pre-migration source snapshot.

Usage: python3 experiments/issue-56/reproduce-legacy-http.py <commit>
Only tracked JavaScript sources and package metadata are extracted; no install,
build, real account or application directory is used. Exit 1 is expected for
the legacy JSON server. The temporary source snapshot is removed afterward.
"""

import io
import pathlib
import shutil
import subprocess
import sys
import tarfile
import tempfile

root = pathlib.Path(__file__).resolve().parents[2]
ref = subprocess.check_output(
    ["git", "rev-parse", "--verify", sys.argv[1] + "^{commit}"], cwd=root, text=True
).strip()
with tempfile.TemporaryDirectory(prefix="ms-legacy-http-") as folder:
    fixture = pathlib.Path(folder)
    archive = subprocess.check_output(
        ["git", "archive", ref, "js/src", "package.json"], cwd=root
    )
    with tarfile.open(fileobj=io.BytesIO(archive)) as files:
        files.extractall(fixture, filter="data")
    (fixture / "node_modules").symlink_to(root / "node_modules", target_is_directory=True)
    shutil.copytree(root / "js/src/transport", fixture / "js/src/transport", dirs_exist_ok=True)
    (fixture / "js/tests").mkdir()
    shutil.copy(root / "js/tests/lino-http.test.js", fixture / "js/tests/lino-http.test.js")
    print("Legacy snapshot:", ref, flush=True)
    result = subprocess.run(
        ["node", "--max-old-space-size=192", "--stack-size=1024", "--test",
         "--test-concurrency=1", "--test-timeout=30000", "js/tests/lino-http.test.js"],
        cwd=fixture,
    )
    sys.exit(result.returncode)
