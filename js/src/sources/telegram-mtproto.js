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
 */

import { importTelegram } from './telegram-layer.js';
import { proxyOptions } from './telegram-proxy.js';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

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
} = {}) => {
  // Connect with an existing session string and read the account. Used by
  // the credential finder to resolve a discovered `.telegram_session` to
  // its real @username instead of grouping it only by phone.
  const identify = async ({ apiId, apiHash, session }) => {
    const client = await clientFactory({ apiId, apiHash, session });
    await client.connect();
    try {
      return accountOf(await client.getMe());
    } finally {
      await client.disconnect?.();
    }
  };

  // The interactive sign-in, bridged across separate HTTP requests: the
  // GramJS `start()` callbacks await deferreds that later requests resolve.
  const createLogin = async ({ apiId, apiHash, phone }) => {
    const client = await clientFactory({ apiId, apiHash, session: '' });
    const code = deferred();
    const password = deferred();
    const ctrl = {
      state: 'starting',
      error: null,
      account: null,
      session: null,
    };
    driveLogin({ client, ctrl, code, password, phone });
    return loginController({
      client,
      ctrl,
      code,
      password,
      settle: settleFor(ctrl, now),
    });
  };

  return { identify, createLogin };
};

// Wait until the login flow leaves `want` (asks for the next thing,
// finishes, or fails). The GramJS callbacks flip `ctrl.state`.
const settleFor = (ctrl, now) => async (want) => {
  const deadline = now() + 60000;
  while (ctrl.state === want && now() < deadline && !ctrl.error) {
    await new Promise((r) => globalThis.setTimeout(r, 25));
  }
  if (ctrl.error) {
    throw ctrl.error;
  }
  return ctrl.state;
};

// Kick off GramJS `start()`; its callbacks resolve from the deferreds and
// flip `ctrl.state` so the HTTP layer knows what to ask for next.
const driveLogin = ({ client, ctrl, code, password, phone }) => {
  client
    .start({
      phoneNumber: async () => phone,
      phoneCode: async () => {
        ctrl.state = 'code';
        return code.promise;
      },
      password: async () => {
        ctrl.state = 'password';
        return password.promise;
      },
      onError: (error) => {
        ctrl.error = error;
      },
    })
    .then(async () => {
      ctrl.session = client.session.save();
      ctrl.account = accountOf(await client.getMe());
      ctrl.state = 'done';
    })
    .catch((error) => {
      ctrl.error = ctrl.error ?? error;
      ctrl.state = 'error';
    });
};

const loginController = ({ client, ctrl, code, password, settle }) => ({
  get state() {
    return ctrl.state;
  },
  get account() {
    return ctrl.account;
  },
  get session() {
    return ctrl.session;
  },
  // Telegram has sent the code; the client is now waiting for it.
  async ready() {
    return settle('starting');
  },
  async submitCode(value) {
    code.resolve(String(value));
    return settle('code');
  },
  async submitPassword(value) {
    password.resolve(String(value));
    return settle('password');
  },
  async cancel() {
    code.reject?.(new Error('cancelled'));
    password.reject?.(new Error('cancelled'));
    await client.disconnect?.();
  },
});
