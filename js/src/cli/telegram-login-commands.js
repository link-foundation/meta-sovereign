import { defaultStoreDir } from '../storage/app-directory.js';
import {
  createTelegramMtproto,
  gramjsClientFactory,
} from '../sources/telegram-mtproto.js';
import { importTelegram } from '../sources/telegram-layer.js';
import { readProxy } from '../sources/telegram-proxy.js';
import { loginError } from '../sources/telegram-login-lifecycle.js';
import {
  readLegacyTelegramSession,
  saveTelegramUserSession,
} from '../sources/telegram-user-session.js';
import { askTerminalSecret } from './secret-prompt.js';

export const TELEGRAM_LOGIN_HELP = `  telegram-login [--api-id=<id>] [--store=<dir>]
  telegram-session-import --file=<legacy-string-session-file> [--api-id=<id>] [--store=<dir>]
                API hash and phone use TELEGRAM_API_HASH/TELEGRAM_PHONE or masked terminal prompts.
                API ID also accepts TELEGRAM_API_ID; code/2FA prompts are masked. Sessions stay in the store.`;

const safeCode = (error) => {
  const knownMessage =
    /^(PHONE_CODE_(?:INVALID|EMPTY|EXPIRED)|PHONE_NUMBER_(?:INVALID|BANNED)|PASSWORD_HASH_INVALID|AUTH_USER_CANCEL)$/.test(
      error?.message
    )
      ? error.message
      : null;
  const candidate = error?.code ?? error?.errorMessage ?? knownMessage;
  return /^[A-Z][A-Z0-9_]{0,79}$/.test(candidate) ? candidate : 'LOGIN_FAILED';
};
const apiCredentials = async (store, args, env, ask, signal) => {
  const saved = async (key) =>
    (await store.get(`secret:telegram:${key}`))?.value;
  const apiId = String(
    args['api-id'] ??
      env.TELEGRAM_API_ID ??
      (await saved('api-id')) ??
      (await ask('Telegram API ID', { signal }))
  ).trim();
  const apiHash = String(
    env.TELEGRAM_API_HASH ??
      (await saved('api-hash')) ??
      (await ask('Telegram API hash', { signal }))
  ).trim();
  if (!/^[1-9]\d{0,9}$/.test(apiId) || !/^[a-fA-F0-9]{32}$/.test(apiHash)) {
    throw loginError(
      'API_CREDENTIALS',
      'valid api_id and api_hash are required'
    );
  }
  return { apiId, apiHash };
};
const publicAccount = (account) => ({
  id: account.id,
  username: account.username ?? null,
});
const interactiveLogin = async ({
  mtproto,
  credentials,
  env,
  ask,
  signal,
  setLogin,
  log,
}) => {
  const phone = String(
    env.TELEGRAM_PHONE ?? (await ask('Telegram phone number', { signal }))
  ).trim();
  if (!/^\+?[0-9][0-9 ()-]{4,31}$/.test(phone)) {
    throw loginError('PHONE_NUMBER_INVALID', 'a phone number is required');
  }
  signal.throwIfAborted();
  const login = await mtproto.createLogin({ ...credentials, phone });
  setLogin(login);
  signal.throwIfAborted();
  let state = await login.ready();
  for (let attempts = 0; attempts < 20 && state !== 'done'; attempts++) {
    signal.throwIfAborted();
    if (!['code', 'password'].includes(state)) {
      throw loginError('LOGIN_STATE', 'login did not request code or password');
    }
    const value = await ask(
      state === 'code' ? 'Telegram login code' : 'Telegram 2FA password',
      { signal }
    );
    signal.throwIfAborted();
    try {
      state = await (state === 'code'
        ? login.submitCode(value)
        : login.submitPassword(value));
    } catch (error) {
      signal.throwIfAborted();
      state = login.state;
      if (!['code', 'password'].includes(state)) {
        throw error;
      }
      log(JSON.stringify({ ok: false, retry: true, code: safeCode(error) }));
    }
  }
  if (state !== 'done') {
    throw loginError('LOGIN_RETRY_LIMIT', 'too many login attempts');
  }
  return { session: login.session, account: login.account };
};

export const createTelegramLoginCommands = ({
  openStore,
  ask = askTerminalSecret,
  env = process.env,
  createMtproto = (store) =>
    createTelegramMtproto({
      clientFactory: gramjsClientFactory(importTelegram, {
        proxy: () => readProxy(store),
      }),
    }),
} = {}) => {
  const run = (importing) => async (args, log) => {
    if (
      (importing && typeof args.file !== 'string') ||
      ['api-hash', 'phone', 'code', 'password', 'session'].some(
        (key) => args[key] !== undefined
      )
    ) {
      log(JSON.stringify({ ok: false, code: 'BAD_REQUEST' }));
      return 1;
    }
    const controller = new AbortController();
    let login;
    let store;
    const stop = (reason) => {
      controller.abort(reason);
      login?.cancel().catch(() => {});
    };
    const cancel = () => stop(loginError('LOGIN_CANCELLED', 'login cancelled'));
    const timer = globalThis.setTimeout(
      () => stop(loginError('LOGIN_TIMEOUT', 'login timed out')),
      300_000
    );
    timer.unref?.();
    process.once('SIGINT', cancel);
    process.once('SIGTERM', cancel);
    try {
      store = await openStore(args.store ?? defaultStoreDir());
      const credentials = await apiCredentials(
        store,
        args,
        env,
        ask,
        controller.signal
      );
      const mtproto = createMtproto(store);
      const result = importing
        ? await (async () => {
            const session = await readLegacyTelegramSession(args.file);
            controller.signal.throwIfAborted();
            const account = await mtproto.identify({ ...credentials, session });
            return { session, account };
          })()
        : await interactiveLogin({
            mtproto,
            credentials,
            env,
            ask,
            signal: controller.signal,
            setLogin: (value) => {
              login = value;
            },
            log,
          });
      controller.signal.throwIfAborted();
      if (!result.session || !/^[1-9]\d{0,19}$/.test(result.account?.id)) {
        throw loginError('LOGIN_IDENTITY', 'login has no verified account');
      }
      await saveTelegramUserSession(store, {
        ...credentials,
        session: result.session,
      });
      log(
        JSON.stringify({
          ok: true,
          imported: importing,
          account: publicAccount(result.account),
        })
      );
      return 0;
    } catch (error) {
      log(
        JSON.stringify({
          ok: false,
          code: safeCode(controller.signal.reason ?? error),
        })
      );
      return 1;
    } finally {
      globalThis.clearTimeout(timer);
      process.removeListener('SIGINT', cancel);
      process.removeListener('SIGTERM', cancel);
      try {
        await login?.cancel();
      } finally {
        await store?.close();
      }
    }
  };
  return { 'telegram-login': run(false), 'telegram-session-import': run(true) };
};
