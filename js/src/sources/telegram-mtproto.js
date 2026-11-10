/**
 * Telegram **user-account** auth over MTProto, the way konard/telegram-bot
 * does it: a GramJS `TelegramClient` built from an `api_id` / `api_hash`
 * and a `StringSession`, signed in with `client.start({ phoneNumber,
 * phoneCode, password })`, then `client.session.save()` is the reusable
 * session string (that project writes it to `.telegram_session`).
 *
 * GramJS (the `telegram` package) is a heavy, optional dependency, loaded
 * lazily so the rest of the server never needs it. The client itself is
 * injected (`clientFactory`) so the login state machine is unit-tested
 * with a fake and the real GramJS lives only in `gramjsClientFactory`.
 *
 * Two entry points:
 *   identify({apiId,apiHash,session})  connect with an existing session,
 *                                      read the account (getMe), disconnect.
 *   createLogin({apiId,apiHash,phone}) drive the interactive sign-in across
 *                                      HTTP requests: start → code → (2FA)
 *                                      password → a saved session string.
 *   createQrLogin({apiId,apiHash})     the same by QR code (R-Y203), see
 *                                      ./telegram-qr-login.js.
 */

import { importTelegram } from './telegram-layer.js';
import { proxyOptions } from './telegram-proxy.js';
import { startQrLogin } from './telegram-qr-login.js';
import { startPhoneLogin } from './telegram-phone-login.js';
import { createLoginLifetime } from './telegram-login-lifecycle.js';

// GramJS returns the id as a BigInt (or a big-integer object) and camelCase
// names; normalize the id to a plain string so it survives JSON.stringify
// (a raw BigInt throws "Do not know how to serialize a BigInt").
const idOf = (me) => {
  const raw = me?.id ?? null;
  return raw === null ? null : String(raw.value ?? raw);
};

export const accountOf = (me = {}) => ({
  id: idOf(me),
  username: me.username ?? null,
  firstName: me.firstName ?? me.first_name ?? null,
  lastName: me.lastName ?? me.last_name ?? null,
  phone: me.phone ?? null,
});

// `{ proxy }` for GramJS when a proxy is set, else nothing (direct).
const proxyParams = (setting) => {
  const proxy = proxyOptions(setting);
  return proxy ? { proxy } : {};
};

// Build the real GramJS client. Imported lazily; absent in environments
// that never do user-account auth.
// `proxy()` (optional) answers the saved connection proxy setting when a
// client is built (R-Y192), so a changed proxy is used by the next one.
export const gramjsClientFactory =
  (importer = importTelegram, { proxy = async () => null } = {}) =>
  async ({ apiId, apiHash, session }) => {
    const telegram = await importer();
    const { TelegramClient } = telegram;
    const { StringSession } = telegram.sessions;
    const client = new TelegramClient(
      new StringSession(session ?? ''),
      Number(apiId),
      String(apiHash),
      // Every "wait N seconds" reaches the account's queue, which holds
      // all requests that long (GramJS would otherwise sleep through
      // waits under a minute and retry at once, unseen).
      {
        connectionRetries: 5,
        floodSleepThreshold: 0,
        ...proxyParams(await proxy()),
      }
    );
    return client;
  };

export const createTelegramMtproto = ({
  // (opts) -> a GramJS-like client ({ start, connect, disconnect, getMe,
  // session: { save() } }). Defaults to the real GramJS client.
  clientFactory = gramjsClientFactory(),
  now = () => Date.now(),
  // The GramJS `Api` namespace (the QR sign-in builds requests with it).
  loadApi = async () => (await importTelegram()).Api,
  identifyTimeoutMs = 12_000,
  loginTimeoutMs = 300_000,
  debug = false,
  log,
} = {}) => {
  // Connect with an existing session string and read the account. Used by
  // the credential finder to resolve a discovered `.telegram_session` to
  // its real @username instead of grouping it only by phone.
  const identify = async ({ apiId, apiHash, session }) => {
    const client = await clientFactory({ apiId, apiHash, session });
    const lifetime = createLoginLifetime(client, {
      timeoutMs: identifyTimeoutMs,
      debug,
      log,
    });
    try {
      await lifetime.run(() => client.connect());
      return accountOf(await lifetime.run(() => client.getMe()));
    } finally {
      await lifetime.close();
    }
  };

  // The interactive sign-in, bridged across separate HTTP requests: the
  // GramJS `start()` callbacks await deferreds that later requests resolve.
  const createLogin = async ({ apiId, apiHash, phone }) => {
    const client = await clientFactory({ apiId, apiHash, session: '' });
    return startPhoneLogin({
      client,
      phone,
      accountOf,
      timeoutMs: loginTimeoutMs,
      debug,
      log,
    });
  };

  // The sign-in by QR code (R-Y203): same controller shape as createLogin's.
  const createQrLogin = async ({ apiId, apiHash }) => {
    const Api = await loadApi();
    return startQrLogin({
      client: await clientFactory({ apiId, apiHash, session: '' }),
      apiId,
      apiHash,
      Api,
      accountOf,
      now,
      timeoutMs: loginTimeoutMs,
      debug,
      log,
    });
  };

  return { identify, createLogin, createQrLogin };
};
