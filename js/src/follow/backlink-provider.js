import { createBacklinkVk } from './backlink-vk.js';
import { backlinkFailure } from './backlink-shape.js';

export const createBacklinkProvider = async (
  { store, telegramAccount },
  source
) => {
  if (source === 'vk') {
    return createBacklinkVk({ store });
  }
  const account =
    typeof telegramAccount === 'function'
      ? await telegramAccount()
      : telegramAccount;
  if (source !== 'telegram' || !account?.followBacklinkAdapter) {
    throw backlinkFailure('user-account-required');
  }
  return account.followBacklinkAdapter();
};
