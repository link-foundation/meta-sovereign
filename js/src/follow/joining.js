import { createFollowVkJoining } from './join-vk.js';
import { backlinkFailure } from './backlink-shape.js';

const accepted = (answer) => {
  if (answer?.ok === false) {
    throw Object.assign(
      backlinkFailure(answer.code ?? 'read-failed'),
      answer.providerError ? { errorMessage: answer.providerError } : {}
    );
  }
  return answer;
};
export const createFollowJoining = async (
  { telegramAccount, ...options },
  source
) => {
  if (source === 'vk') {
    return createFollowVkJoining(options);
  }
  const account =
    typeof telegramAccount === 'function'
      ? await telegramAccount()
      : telegramAccount;
  if (!account?.followTelegramPreview || !account.followTelegramApply) {
    throw backlinkFailure('user-account-required');
  }
  return {
    preview: async (url, preferences) => ({
      ...accepted(
        await account.followTelegramPreview({
          operation: 'join',
          target: url,
          ...preferences,
        })
      ),
      source: 'telegram',
      url,
    }),
    apply: async (review, { cancelled, read }) => {
      if (cancelled()) {
        await account.followTelegramCancel?.({ planId: review.planId });
        throw backlinkFailure('cancelled');
      }
      return account.followTelegramApply(
        { planId: review.planId, confirm: true },
        { cancelled, read }
      );
    },
    discard: (review) =>
      account.followTelegramCancel?.({ planId: review.planId }),
  };
};
