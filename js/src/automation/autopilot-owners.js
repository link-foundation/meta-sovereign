/** One controlled lifecycle per automation; independent owners can still proceed. */
export const createAutopilotOwners = ({ loop, failed }) => {
  const running = new Map();
  const controls = new Map();
  let closed = false;
  const requireOpen = () => {
    if (closed) {
      throw new Error('Autopilot owner closed');
    }
  };
  const stop = async (id) => {
    const owner = running.get(id);
    owner?.controller.abort();
    await owner?.pending;
  };
  return {
    requireOpen,
    has: (id) => running.has(id),
    control(id, task) {
      const result = (controls.get(id) ?? Promise.resolve()).then(task);
      const settled = result.catch(() => {});
      controls.set(id, settled);
      settled.then(() => {
        if (controls.get(id) === settled) {
          controls.delete(id);
        }
      });
      return result;
    },
    run(automation) {
      requireOpen();
      const controller = new AbortController();
      const owner = { controller };
      running.set(automation.id, owner);
      owner.pending = Promise.resolve()
        .then(() => loop(automation, controller.signal))
        .catch((error) => {
          if (!controller.signal.aborted) {
            return failed(automation, error);
          }
        })
        .finally(() => {
          if (running.get(automation.id) === owner) {
            running.delete(automation.id);
          }
        });
    },
    stop,
    async close() {
      closed = true;
      // Signal every owner before waiting for any provider or control action.
      for (const owner of running.values()) {
        owner.controller.abort();
      }
      await Promise.allSettled([
        ...controls.values(),
        ...[...running.values()].map((owner) => owner.pending),
      ]);
    },
  };
};
