import test from 'node:test';
import assert from 'node:assert/strict';
import {
  independentVkKinds as kinds,
  withIndependentVkJobs,
} from '../../experiments/issue-56/vk-independent-fixture.mjs';

for (const selected of kinds) {
  test(
    `VK ${selected} runs independently and its disable survives Lino reopen`,
    { timeout: 15000 },
    async () =>
      withIndependentVkJobs(async (f) => {
        const originals = {};
        for (const kind of kinds) {
          originals[kind] = (await f.read(kind)).settings;
          assert.equal(originals[kind].enabled, false, kind);
        }
        assert.equal(f.timers.size, 6);
        assert.ok(
          [...f.timers.values()].every((timer) => timer.milliseconds === 60000)
        );
        await f.poll();
        for (const kind of kinds) {
          assert.equal(f.adapters[kind].fake.calls.length, 0, kind);
        }

        const enabled = {
          ...originals[selected],
          enabled: true,
          everyMinutes: 7,
          ...(selected === 'wall' ? { communities: '42' } : {}),
        };
        assert.deepEqual((await f.save(selected, enabled)).settings, enabled);
        await f.reopen();
        assert.equal(f.timers.size, 6);
        await f.poll();
        for (const kind of kinds) {
          const { settings, last } = await f.read(kind);
          if (kind !== selected) {
            assert.deepEqual(settings, originals[kind], kind);
            assert.equal(last, null, kind);
            assert.equal(f.adapters[kind].fake.calls.length, 0, kind);
          } else {
            assert.deepEqual(settings, enabled);
            assert.equal(last.status, 'confirmed');
            if (kind === 'online') {
              assert.equal(
                f.adapters[kind].fake.calls.filter(
                  (call) => call.name === 'account.setOnline'
                ).length,
                1
              );
            } else {
              assert.ok(f.adapters[kind].effects.length > 0);
              assert.ok(last.results.length > 0);
              assert.ok(
                last.results.every((result) => result.status === 'confirmed')
              );
            }
          }
        }
        const receipt = (await f.read(selected)).last;
        const counts = Object.fromEntries(
          kinds.map((kind) => [kind, f.adapters[kind].fake.calls.length])
        );
        const disabled = { ...enabled, enabled: false };
        await f.save(selected, disabled);
        f.advance(2 * 86400000);
        await f.reopen();
        assert.equal(f.timers.size, 6);
        assert.deepEqual((await f.read(selected)).settings, disabled);
        assert.deepEqual((await f.read(selected)).last, receipt);
        await f.poll();
        for (const kind of kinds) {
          assert.equal(f.adapters[kind].fake.calls.length, counts[kind], kind);
          assert.deepEqual(
            (await f.read(kind)).settings,
            kind === selected ? disabled : originals[kind],
            kind
          );
        }
        await f.stop();
        assert.equal(f.timers.size, 0);
      })
  );
}
