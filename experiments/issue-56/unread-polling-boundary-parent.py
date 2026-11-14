"""Exercise the exact published assertion while the following native read is held."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
source = root / 'js/tests/helpers/e2e-unread-polling-controls.mjs'
parent = '236f42a740f35f8452279110f5679411815f628c'
saved = source.read_bytes()
try:
    old = subprocess.check_output(
        ['git', 'show', f'{parent}:{source.relative_to(root)}'], cwd=root).decode()
    old = old.replace(
        "import { questionBrowserUi } from './question-browser-ui.mjs';",
        "import { questionBrowserUi } from './question-browser-ui.mjs';\n"
        "import { unreadPollingBoundary } from '../../../experiments/issue-56/unread-polling-boundary.mjs';")
    old = old.replace('  const scenario = await questionBrowserUi(browser, {',
                      '  const boundary = unreadPollingBoundary();\n'
                      '  const scenario = await questionBrowserUi(browser, {', 1)
    old = old.replace('serverOptions: { unreadReview: true },',
                      'serverOptions: { unreadReview: true, ...boundary },', 1)
    assertion = '        assert.deepEqual(await ownerState(fixture.page), original);'
    assert old.count(assertion) == 1
    old = old.replace(assertion, '        await boundary.started.wait();\n' + assertion, 1)
    old = old.replace('    await scenario.close();',
                      '    boundary.release();\n    await scenario.close();', 1)
    source.write_text(old)
    env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384',
               RUN_BROWSER_E2E='1', E2E_BROWSER='chromium',
               E2E_EXECUTABLE_PATH='/opt/google/chrome/chrome',
               MS_BROWSER_CHAT_VIEW_DEBUG='1', MS_BROWSER_CHAT_SCAN_DEBUG='1')
    log = root / 'ci-logs/polling-boundary-parent.log'
    with log.open('w') as output:
        result = subprocess.run(
            ['node', 'js/tests/e2e-question-unread-polling-browser.mjs'],
            cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT)
    text = log.read_text()
    if result.returncode != 1 or '+   listTop: 0' not in text or '-   listTop: 100' not in text:
        raise RuntimeError(f'Expected native in-flight viewport assertion failure; exit {result.returncode}')
    print(f'{parent}: exact full-state assertion fails at the held third pass (listTop 0 versus 100)')
finally:
    source.write_bytes(saved)
    print('Restored current test bytes')
