import { formFailure as failure } from './options.js';
import { reviewSnapshotKey } from './review-targets.js';

/** Keep the same ownership and uncertainty boundary for one reviewed effect. */
export const performReviewedEffect = async ({
  record,
  state,
  check,
  inspect,
  issue,
  readback,
  unknownCode,
}) => {
  let issued = false;
  let report = null;
  try {
    await state.targets.check();
    report = await inspect(record.browser, { check });
    if (reviewSnapshotKey(report) !== reviewSnapshotKey(state.inspection)) {
      throw failure(
        'form-changed',
        'The reviewed form changed. Plan the current page again.'
      );
    }
    await state.targets.check();
    check();
    issued = true;
    await issue();
    check();
    await state.targets.check();
    return await readback();
  } catch (error) {
    return {
      state: issued ? 'uncertain' : 'refused',
      code: error.code ?? unknownCode,
      report: issued ? null : report,
    };
  } finally {
    await state.targets.dispose();
  }
};
