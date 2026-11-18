import assert from 'node:assert/strict';

export const pausedVkPolicy = () => {
  let callback;
  let cleared = 0;
  let paused;
  const waiting = new Promise((resolve) => {
    paused = resolve;
  });
  return {
    options: {
      setInterval: (fn) => {
        callback = fn;
        return 17;
      },
      clearInterval: () => {
        cleared++;
      },
      sleep: (_ms, signal) =>
        new Promise((_resolve, reject) => {
          paused();
          signal.addEventListener(
            'abort',
            () => reject(new Error('Fixture stopped')),
            { once: true }
          );
        }),
    },
    verify: async (job, adapter, afterStop = async () => {}) => {
      job.start();
      job.start();
      const running = job.run({ scheduled: true });
      assert.equal(job.run({ scheduled: true }), running);
      assert.equal(typeof callback, 'function');
      await waiting;
      assert.equal(adapter.effects.length, 1);
      await job.stop();
      assert.equal((await running).last.status, 'refused');
      await afterStop();
      assert.equal(adapter.effects.length, 1);
      assert.equal(cleared, 1);
    },
  };
};

export const verifyVkDurableWriteFailure = async (withJob, ledgerId, run) => {
  for (const stage of ['pending', 'partial']) {
    await withJob(async ({ job, store, adapter }) => {
      const put = store.put.bind(store);
      let reject = true;
      store.put = async (row) => {
        if (reject && row.id === ledgerId && row.status === stage) {
          reject = false;
          throw new Error('Fixture durable receipt refused');
        }
        return put(row);
      };
      assert.equal(
        (await run(job)).last.status,
        stage === 'pending' ? 'refused' : 'unknown'
      );
      assert.equal(adapter.effects.length, stage === 'pending' ? 0 : 1);
      if (stage === 'partial') {
        assert.equal((await job.preview()).plan.items[0].reason, 'unknown');
        await run(job);
        assert.equal(adapter.effects.length, 1);
      }
    });
  }
};
