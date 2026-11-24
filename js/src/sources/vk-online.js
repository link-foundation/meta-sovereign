import { resolveOption } from './http.js';
import { withTooManyBackoff } from './vk-limits.js';

/** Online refresh preserves pacing and checks consent immediately before POST. */
export const createVkOnline = ({ once, token, sleep }) => ({
  async setOnline(options = {}, beforeIssue) {
    const accessToken = resolveOption(
      options.token ?? token,
      'VK_ACCESS_TOKEN',
      'VK access token'
    );
    // Recheck after each rate wait, including a definite error-6 retry.
    // Ambiguous transport failures remain unknown and are never replayed.
    const result = await withTooManyBackoff(
      () =>
        once(
          'account.setOnline',
          {},
          accessToken,
          { write: true, retries: 0 },
          beforeIssue
        ),
      { sleep }
    );
    if (result !== 1) {
      throw Object.assign(new Error('VK did not confirm online status'), {
        code: 'unconfirmed',
      });
    }
    return { confirmed: true };
  },
});
