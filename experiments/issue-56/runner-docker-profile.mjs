import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRunnerProfile } from '../../js/src/cli/runner-profile.js';
import { dockerProfile } from './runner-docker-fixture.mjs';

test('the actual shared profile admits explicit remote Docker and keeps local Screen', () => {
  const targets = validateRunnerProfile(dockerProfile());
  assert.equal(targets.server.isolation, 'docker');
  assert.equal(targets.server.image, dockerProfile().server.image);
  assert.equal(targets.local.isolation, 'screen');
});
test('the actual shared profile retains the compatible Screen default', () => {
  const profile = dockerProfile();
  delete profile.server.image;
  delete profile.server.isolation;
  assert.equal(validateRunnerProfile(profile).server.isolation, 'screen');
});
