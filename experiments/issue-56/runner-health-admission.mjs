import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../js/src/cli/index.js';
import { runnerApiFixture } from './runner-api-fixture.mjs';
import { createServerControl } from '../../js/src/server/rolling-control.js';
import {
  readWireResponse,
  decodeWire,
  LINO_TEXT,
} from '../../js/src/transport/lino.js';

if (process.argv.includes('--api')) {
  const fixture = await runnerApiFixture({ initial: { local: 'running' } });
  try {
    const response = await fetch(
      `${fixture.base}/api/runner/inspect?mode=local`
    );
    assert.equal(
      response.status,
      200,
      'application inspection was not admitted by the real API'
    );
    assert.equal((await readWireResponse(response)).application.state, 'ready');
    assert.ok(
      fixture.backend.calls.every(([, action]) =>
        ['probe', 'health'].includes(action)
      )
    );
    console.log(
      JSON.stringify({ inspectionAdmitted: true, liveProvider: false })
    );
  } finally {
    await fixture.close();
  }
} else {
  const dir = await mkdtemp(join(tmpdir(), 'health-cli-admission-'));
  let control;
  try {
    control = await createServerControl({
      storeDir: dir,
      handle: { status: () => ({}), health: () => ({ state: 'ready' }) },
    });
    const output = [];
    const code = await runCli(['runner', 'health', `--store=${dir}`], {
      log: (line) => output.push(line),
    });
    assert.equal(
      code,
      0,
      'application health was not admitted by the real CLI'
    );
    assert.equal(decodeWire(output[0], LINO_TEXT).state, 'ready');
    console.log(JSON.stringify({ healthAdmitted: true, liveProvider: false }));
  } finally {
    await control?.close();
    await rm(dir, { recursive: true, force: true });
  }
}
