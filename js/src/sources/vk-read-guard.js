/** Shared identity and ownership guards for explicit read-only VK snapshots. */
export const vkAccountReadGuard =
  (optionsFor, options, live, request) => async () => {
    const refuse = () => {
      throw Object.assign(new Error('VK account or credential changed'), {
        code: 'incomplete',
      });
    };
    if ((await optionsFor()).token !== options.token) {
      refuse();
    }
    const self = await live.call('users.get', {}, options.token);
    if (
      !Array.isArray(self) ||
      self.length !== 1 ||
      self[0]?.id !== request.accountId
    ) {
      refuse();
    }
    if ((await optionsFor()).token !== options.token) {
      refuse();
    }
  };
