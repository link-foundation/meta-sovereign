import assert from 'node:assert/strict';
import { runnerLaunch } from '../../js/src/server/runner-session.js';
import { validateRunnerProfile } from '../../js/src/cli/runner-profile.js';
import { runnerProfile } from './runner-fixture.mjs';

// Admission check against the documented interface; never executes start.
for (const target of Object.values(validateRunnerProfile(runnerProfile()))) {
  const argv = runnerLaunch(target);
  const wrapper = argv.slice(1, argv.indexOf('--'));
  assert.equal(wrapper[2], '--session');
  assert.equal(wrapper[3], target.session);
  assert.equal(wrapper.includes('--name'), false);
}
console.log('Local and SSH launches select the configured start session.');
