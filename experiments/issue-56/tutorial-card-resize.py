"""Compare one short WebKit case, restoring the working sources in all cases.

Run from the repository root. Only the card ResizeObserver notifications are
withheld by the browser fixture; other observers and real app layout run.
"""

import os
from pathlib import Path
import subprocess


source = Path("js/src/web/tutorial.js")
bundle = Path("js/src/web/app.min.js")
saved_source = source.read_bytes()
saved_bundle = bundle.read_bytes()
baseline = subprocess.check_output([
    "git", "show", "10d06262e078625b49ab81faaa811194ca0b5f7b:js/src/web/tutorial.js"
])
try:
    for label, content in [("before", baseline), ("after", saved_source)]:
        source.write_bytes(content)
        with open(f"ci-logs/tutorial-card-resize-{label}-build.log", "wb") as log:
            subprocess.run(["npm", "run", "build:web"], stdout=log,
                           stderr=subprocess.STDOUT, check=True)
        env = dict(os.environ, RUN_BROWSER_E2E="1", E2E_BROWSER="webkit",
                   E2E_ARTIFACT_DIR=f"/tmp/issue-56-tutorial-resize-{label}")
        with open(f"ci-logs/tutorial-card-resize-{label}.log", "wb") as log:
            result = subprocess.run(
                ["node", "js/tests/e2e-tutorial-card-resize-browser.mjs"],
                env=env, stdout=log, stderr=subprocess.STDOUT)
        print(f"{label}: exit {result.returncode}", flush=True)
        assert result.returncode == (1 if label == "before" else 0)
finally:
    source.write_bytes(saved_source)
    bundle.write_bytes(saved_bundle)
