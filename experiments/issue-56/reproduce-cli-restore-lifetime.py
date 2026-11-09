"""Reproduce the pre-fix writer lifetime with a bounded offline CLI test.

Run from the repository root after other CLI tests have finished. The original
source is restored even when the regression fails, as expected before the fix.
"""

from pathlib import Path
import subprocess

source = Path("js/src/cli/index.js")
original = source.read_text()
start = original.index("const restoreCmd =")
end = original.index("const serveOptions =", start)
block = original[start:end]
assert "await store.close?.();" in block
try:
    source.write_text(
        original[:start]
        + block.replace("await store.close?.();", "// Previous restore retained its writer.")
        + original[end:]
    )
    result = subprocess.run([
        "node", "--max-old-space-size=192", "--test", "--test-concurrency=1",
        "--test-name-pattern=CLI config", "js/tests/recovery-controls.test.js",
    ], check=False)
    assert result.returncode != 0, "the pre-fix restore unexpectedly passed"
finally:
    source.write_text(original)
