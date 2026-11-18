import test from 'node:test';
import assert from 'node:assert/strict';
import { onlineAdmission } from '../../experiments/issue-56/vk-online-admission.mjs';

for (const stage of ['options', 'ack', 'limiter', 'backoff']) {
  for (const change of ['disable', 'interval', 'token', 'stop', 'unchanged']) {
    test(
      `VK online admission rechecks ${change} after ${stage}`,
      { timeout: 5000 },
      async () => {
        const receipt = await onlineAdmission(stage, change);
        // Credentials are first read after the durable intent acknowledgement.
        // Rotation before that first read uses the current token normally.
        const confirmed =
          change === 'unchanged' || (stage === 'ack' && change === 'token');
        assert.equal(
          receipt.changedBeforeRelease,
          true,
          'settings must remain editable'
        );
        assert.equal(
          receipt.stoppedBeforeRelease,
          false,
          'stop must drain the paused refresh'
        );
        assert.equal(receipt.tokenLeaked, false);
        assert.equal(
          receipt.calls,
          (stage === 'backoff' ? 1 : 0) + Number(confirmed)
        );
        assert.equal(
          receipt.result.last.status,
          confirmed ? 'confirmed' : 'refused'
        );
        if (!confirmed) {
          assert.equal(receipt.result.last.code, 'policy-changed');
          assert.equal(receipt.result.last.confirmedAt, undefined);
        }
      }
    );
  }
}
