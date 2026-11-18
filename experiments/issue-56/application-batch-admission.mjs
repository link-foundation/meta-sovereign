import { setTimeout as delay } from 'node:timers/promises';

/** Accelerated fixture polls may win admission between a status and an action. */
export const afterBatchAdmission = async (read) => {
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      return await read();
    } catch (error) {
      // jobs-busy is raised before the workspace operation runs. No uncertain
      // operation or refusal after admission is safe to invoke again.
      if (error.code !== 'jobs-busy' || attempt === 199) {
        throw error;
      }
    }
    await delay(5);
  }
};
