"""Run the finite native fixture with opt-in, fixture-only snapshot diagnostics."""
from pathlib import Path
import os
import subprocess

source = Path('js/tests/e2e-browser-merge.mjs').read_text()
target = Path('experiments/issue-56/.tab-merge-trace-runtime.mjs')
source = source.replace("'./helpers/", "'../../js/tests/helpers/")
source = source.replace('return await driver.save(...args);', """
const saved = await driver.save(...args);
console.log(JSON.stringify({ event: 'fixture-save', kind, expected: args[1], next: args[0] }));
return saved;""")
try:
    target.write_text(source)
    with open('ci-logs/tab-merge-trace.log', 'wb') as log:
        result = subprocess.run(['node', '--max-old-space-size=384', str(target)],
                                stdout=log, stderr=subprocess.STDOUT,
                                env=dict(os.environ, RUN_BROWSER_E2E='1', E2E_BROWSER='webkit',
                                         BROWSER_MERGE_TRACE='1'))
    raise SystemExit(result.returncode)
finally:
    target.unlink(missing_ok=True)
