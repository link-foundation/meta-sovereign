import { getSource } from '../sources/index.js';
import { codedError } from '../sources/http.js';
import {
  publicationId,
  unknownPublication,
} from '../sources/publication-receipt.js';
import { createXAuth } from '../sources/x-auth.js';
import { secretValue } from '../sources/email-store.js';
import { safeMessage } from '../server/redact.js';
import { credentialBinding, loadBroadcastCredentials } from './credentials.js';

const requireMethod = (live, method) => {
  if (typeof live?.[method] !== 'function') {
    throw codedError(`Provider does not support ${method}`, 'unsupported');
  }
  return (...args) => live[method](...args);
};
const positiveId = (id) => {
  const value = publicationId(id);
  if (!value) {
    throw unknownPublication('Provider', 'publication');
  }
  return value;
};
const telegramIds = (raw) => {
  const messageIds = raw?.messageIds ?? [raw?.messageId];
  if (!Array.isArray(messageIds) || !messageIds.length) {
    throw unknownPublication('Telegram', 'publication');
  }
  const ids = messageIds.map(positiveId);
  if (
    ids.length !== (raw?.parts ?? 1) ||
    ids.some((id) => Number(id) > 0x7fffffff)
  ) {
    throw unknownPublication('Telegram', 'publication');
  }
  return ids;
};
const telegramUser = async (target, account) => {
  const status = await account?.status?.();
  const configured = status?.connected === true && status.kind === 'user';
  return {
    mode: 'user',
    configured,
    readOnly: false,
    identity: status?.account?.id ?? null,
    post: async (text, clientId) => {
      const raw = await requireMethod(
        account?.live,
        'post'
      )({ text, chat: target.destination, format: target.format, clientId });
      if (raw?.ok !== true) {
        throw codedError(
          raw?.error ?? 'Telegram user publication refused',
          raw?.code ?? 'send-failed'
        );
      }
      return {
        chat: String(raw.chat ?? target.destination),
        messageIds: telegramIds(raw),
      };
    },
    remove: async (receipt) => {
      const raw = await requireMethod(
        account?.live,
        'deleteMessages'
      )({ chat: receipt.chat, ids: receipt.messageIds, revoke: true });
      if (raw?.ok !== true || raw.deleted !== receipt.messageIds.length) {
        throw unknownPublication('Telegram', 'deletion');
      }
      return { deleted: true };
    },
    test: async () => {
      const raw = await requireMethod(account, 'myProfile')();
      if (raw?.ok !== true || !publicationId(raw.id)) {
        throw codedError('Telegram returned no user identity', 'bad-response');
      }
      return {
        ok: true,
        verified: true,
        userId: String(raw.id),
        permissionsVerified: false,
      };
    },
  };
};

const telegramBot = (target, live, values) => ({
  mode: 'bot',
  configured: Boolean(values.botToken),
  readOnly: false,
  post: async (text, clientId) => {
    const raw = await requireMethod(live, 'publishPost')(
      { text, chat: target.destination, format: target.format, clientId },
      { token: values.botToken }
    );
    return {
      chat: String(raw.chat ?? target.destination),
      messageIds: [positiveId(raw.messageId)],
    };
  },
  remove: async (receipt) => {
    for (const messageId of receipt.messageIds) {
      const raw = await requireMethod(live, 'deletePost')(
        { chat: receipt.chat, messageId },
        { token: values.botToken }
      );
      if (raw?.deleted !== true) {
        throw unknownPublication('Telegram', 'deletion');
      }
    }
    return { deleted: true };
  },
  test: () => requireMethod(live, 'testConnection')({ token: values.botToken }),
});

const protectedCall =
  (run, values) =>
  async (...args) => {
    try {
      return await run(...args);
    } catch (error) {
      let message = safeMessage(error);
      for (const value of Object.values(values).filter(Boolean)) {
        message = message.replaceAll(String(value), '<redacted>');
      }
      throw Object.assign(new Error(message), {
        code: error?.code ?? 'provider-failed',
        ambiguous: error?.ambiguous,
        outcome: error?.outcome,
        status: error?.status,
        retryAfter: error?.retryAfter,
      });
    }
  };

const vkProvider = (target, live, values) => {
  const options = {
    token:
      target.authMode === 'community'
        ? values.communityToken
        : values.userToken,
    tokenType: target.authMode,
    ownerId: target.destination,
    fromGroup: target.fromGroup,
    signed: target.signed,
  };
  return {
    mode: target.authMode,
    configured: Boolean(options.token),
    readOnly: false,
    post: async (text, clientId) => {
      const raw = await requireMethod(live, 'publishPost')(
        { text, clientId },
        options
      );
      return {
        ownerId: raw.ownerId,
        postId: positiveId(raw.postId),
        ...(raw.url ? { url: raw.url } : {}),
      };
    },
    remove: (receipt) => requireMethod(live, 'deletePost')(receipt, options),
    test: () => requireMethod(live, 'testConnection')(options),
  };
};

const xProvider = (target, live, values) => {
  const options = { ...values, authMode: target.authMode };
  const state = createXAuth(options).status();
  return {
    ...state,
    post: async (text, clientId) => {
      const raw = await requireMethod(live, 'publishPost')(
        { text, clientId },
        options
      );
      const id = positiveId(raw?.data?.id);
      return { id, url: `https://x.com/i/status/${id}` };
    },
    remove: (receipt) => requireMethod(live, 'deletePost')(receipt, options),
    test: () => requireMethod(live, 'testConnection')(options),
  };
};

/** A bot wins in auto mode; an explicit user destination never falls back. */
export const resolvePublicationProvider = async (
  store,
  target,
  { resolveSource = getSource, telegramAccount = null } = {}
) => {
  const values = await loadBroadcastCredentials(store, target.network);
  const live = resolveSource(target.network)?.live;
  let provider;
  if (target.network === 'telegram') {
    const bot =
      target.authMode === 'bot' ||
      (target.authMode === 'auto' && Boolean(values.botToken));
    provider = bot
      ? telegramBot(target, live, values)
      : await telegramUser(target, telegramAccount);
  } else {
    provider =
      target.network === 'vk'
        ? vkProvider(target, live, values)
        : xProvider(target, live, values);
  }
  const userSession =
    provider.mode === 'user' && target.network === 'telegram'
      ? secretValue(await store.get('secret:telegram:user-session'))
      : null;
  const boundValues = { ...values, userSession };
  const binding = await credentialBinding({
    values: boundValues,
    mode: provider.mode,
    identity: provider.identity ?? null,
  });
  return {
    ...provider,
    binding,
    permissionsVerified: false,
    post: protectedCall(provider.post, boundValues),
    remove: protectedCall(provider.remove, boundValues),
    test: protectedCall(provider.test, boundValues),
  };
};

export const publicProviderState = (provider) => ({
  mode: provider.mode,
  configured: provider.configured,
  readOnly: provider.readOnly,
  permissionsVerified: false,
});

export const requireWritable = (provider) => {
  if (!provider.configured) {
    throw codedError(
      'Configure the selected publication credential first',
      'auth-required'
    );
  }
  if (provider.readOnly) {
    throw codedError(
      'The selected authentication mode cannot publish as a user',
      'read-only-auth'
    );
  }
};
