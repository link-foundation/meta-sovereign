"""Exercise parent CLI/Lino/UI entry points, restoring every working byte."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
parent = '9d31e561d0028822654bd9cf220a236d1178f4e4'
entries = ['js/src/cli/question-commands.js', 'js/src/server/routes-question-answers.js',
           'js/src/web/question-controls.js', 'js/src/web/chat-view.js', 'js/src/web/question-api.js']
bundle = root / 'js/src/web/app.min.js'
held = {name: (root / name).read_bytes() for name in entries}
built = bundle.read_bytes()
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
try:
    for name in entries:
        (root / name).write_bytes(subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root))
    with (root / 'ci-logs/question-browser-before-build.log').open('w') as log:
        subprocess.run(['npm', 'run', 'build:web'], cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
    with (root / 'ci-logs/question-browser-before-ui.log').open('w') as log:
        subprocess.run(['node', 'experiments/issue-56/question-browser-ui.mjs', '--before'], cwd=root, env=env,
                       stdout=log, stderr=subprocess.STDOUT, check=True)
    code = """
import assert from 'node:assert/strict';
import { createAutomationCommands } from './js/src/cli/automation-commands.js';
import { questionBrowserFixture } from './experiments/issue-56/question-browser-fixture.mjs';
const env = await questionBrowserFixture();
const cli = createAutomationCommands({ openStore: async () => env.store, send: env.send });
const output = [];
assert.equal(await cli.automations({ _: ['answers', 'browser', 'show'] }, (line) => output.push(line)), 1);
assert.equal(env.state.reads.length, 0);
console.log('Parent refuses browser answer CLI; no provider action.');
"""
    with (root / 'ci-logs/question-browser-before-cli.log').open('w') as log:
        subprocess.run(['node', '--input-type=module', '-e', code], cwd=root, env=env,
                       stdout=log, stderr=subprocess.STDOUT, check=True)
    print('Expected parent CLI, Lino route and browser controls regression confirmed.')
finally:
    for name, data in held.items():
        (root / name).write_bytes(data)
    bundle.write_bytes(built)
