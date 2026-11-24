import { captureReviewTargets } from '../../js/src/forms/review-targets.js';

/** Hold one real disposal until the test has inspected its pending receipt. */
export const prefillCleanupFixture = () => {
  let gate;
  return {
    arm() {
      let entered;
      let release;
      const started = new Promise((resolve) => {
        entered = resolve;
      });
      const pending = new Promise((resolve) => {
        release = resolve;
      });
      gate = { entered, pending };
      return { started, release };
    },
    async capture(...args) {
      const targets = await captureReviewTargets(...args);
      return {
        ...targets,
        async dispose() {
          await targets.dispose();
          const current = gate;
          if (current) {
            gate = null;
            current.entered();
            await current.pending;
          }
        },
      };
    },
  };
};
