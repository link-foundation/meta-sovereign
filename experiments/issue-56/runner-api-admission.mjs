import assert from 'node:assert/strict';
import { runnerApiFixture } from './runner-api-fixture.mjs';
import { readWireResponse, LINO_TEXT } from '../../js/src/transport/lino.js';

const fixture = await runnerApiFixture();
try {
  const response = await fetch(`${fixture.base}/api/runner`, {
    headers: { accept: LINO_TEXT },
  });
  assert.equal(
    response.status,
    200,
    'runner status was not admitted by the real API'
  );
  const answer = await readWireResponse(response);
  assert.deepEqual(answer.states, { local: 'stopped', server: 'stopped' });
  assert.equal(answer.scope, 'isolated-session');
  assert.ok(fixture.backend.calls.every(([, action]) => action === 'probe'));
  console.log(
    JSON.stringify({ apiStatus: true, launched: false, liveProvider: false })
  );
} finally {
  await fixture.close();
}
