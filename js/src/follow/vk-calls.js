import { createVkLive } from '../sources/vk.js';
import { liveOptionsFrom } from '../sources/index.js';
import { publicationId } from '../sources/publication-receipt.js';
import { backlinkFailure } from './backlink-shape.js';

export const createFollowVkCalls = async ({
  store,
  liveFactory = createVkLive,
  ...options
}) => {
  const credentials = await liveOptionsFrom(store, 'vk');
  if (!credentials.token) {
    throw backlinkFailure('not-connected');
  }
  const live = liveFactory({ ...options, ...credentials });
  if (typeof live.callOnce !== 'function') {
    throw backlinkFailure('unsupported');
  }
  const check = async () => {
    const fresh = await liveOptionsFrom(store, 'vk');
    if (fresh.token !== credentials.token) {
      throw backlinkFailure('account-changed');
    }
  };
  const call = async (method, params, write = false, { cancelled } = {}) => {
    const beforeIssue = async () => {
      await check();
      if (cancelled?.()) {
        throw backlinkFailure('cancelled');
      }
    };
    await beforeIssue();
    const answer = await live.callOnce(method, params, { write, beforeIssue });
    if (!write) {
      await check();
    }
    return answer;
  };
  let bound;
  const identity = async () => {
    const users = await call('users.get', {});
    const owner = users?.length === 1 ? publicationId(users[0]?.id) : null;
    if (!owner || users[0].deactivated) {
      throw backlinkFailure('provider-response');
    }
    if (bound && bound !== owner) {
      throw backlinkFailure('account-changed');
    }
    bound = owner;
    return owner;
  };
  return { call, identity };
};
