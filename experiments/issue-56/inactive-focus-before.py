"""Run the actual parent CI helper in its installed bundled headless shell."""
import json
import os
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
parent = 'b73f3433dc050922b0747d0fe4f8f52eba1f8e26'
source = subprocess.check_output([
    'git', 'show', f'{parent}:js/tests/helpers/e2e-browser-scenarios.mjs',
], cwd=root, text=True)
source = source.replace("'./e2e-chat.mjs'", json.dumps(
    (root / 'js/tests/helpers/e2e-chat.mjs').as_uri()))
env = dict(os.environ, RUN_BROWSER_E2E='1', NODE_OPTIONS='--max-old-space-size=384')
env.pop('E2E_EXECUTABLE_PATH', None)
with tempfile.TemporaryDirectory(prefix='ms-focus-parent-') as directory:
    helper = Path(directory) / 'parent.mjs'
    helper.write_text(source)
    script = f"""
import {{ runBrowserScenarios }} from {json.dumps(helper.as_uri())};
import {{ verifyInactiveHistory }} from {json.dumps((root / 'js/tests/helpers/e2e-inactive-history.mjs').as_uri())};
await runBrowserScenarios('question-inactive-history', [verifyInactiveHistory]);
"""
    result = subprocess.run(['node', '--input-type=module', '--eval', script],
                            cwd=root, env=env, text=True, capture_output=True)
    print(result.stdout + result.stderr)
    assert result.returncode != 0
    assert "code: 'browser-background-owner-active'" in result.stderr
    print('Actual parent headless shell refuses the inactive-history traversal.')
