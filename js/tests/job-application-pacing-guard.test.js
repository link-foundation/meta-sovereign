import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationPacingFixture } from '../../experiments/issue-56/application-pacing-fixture.mjs';
import { applicationIdentity } from '../../experiments/issue-56/application-run-fixture.mjs';

for (const outcome of ['challenge', 'delivered', 'dailyLimit']) {
  test(
    `a late native ${outcome} at the action guard retains pacing feedback without dispatch`,
    { timeout: 4000 },
    async (t) => {
      const fixture = applicationPacingFixture(t);
      const receipt = await fixture.open();
      fixture.state.page[outcome] = true;
      if (outcome === 'dailyLimit') {
        fixture.state.page.challenge = true;
      }
      await assert.rejects(
        fixture.service['application-advance'](
          applicationIdentity(receipt, { action: 'enter', confirm: true })
        ),
        { code: 'jobs-application-changed' }
      );
      const before = (await fixture.queue()).pacing;
      assert.equal(before.challenges, outcome === 'challenge' ? 1 : 0);
      assert.equal(before.deliveries, outcome === 'delivered' ? 1 : 0);
      assert.equal(before.saved, true);
      assert.equal(fixture.state.entered, 0);
      assert.equal(fixture.state.submitted, 0);
      assert.deepEqual(fixture.state.writes, []);
      await fixture.service['application-read'](applicationIdentity(receipt));
      assert.deepEqual((await fixture.queue()).pacing, before);
    }
  );
}
