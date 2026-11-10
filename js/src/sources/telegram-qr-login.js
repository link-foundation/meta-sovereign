/**
 * Sign in to Telegram by QR code, as Telegram Desktop offers it (R-Y203;
 * learned, never copied): the page shows `tg://login?token=<base64url>`
 * as a QR code, the user opens Telegram on the phone, Settings > Devices >
 * Link Desktop Device, and points the phone at the screen.
 *
 * The flow over MTProto:
 *   auth.exportLoginToken { api_id, api_hash, except_ids: [] }
 *     -> auth.loginToken { expires, token }   show it; ask again when it
 *        expires (Desktop refreshes the code too)
 *     -> auth.loginTokenSuccess               signed in
 *     -> auth.loginTokenMigrateTo { dc_id, token }
 *        switch the client to that data centre and call
 *        auth.importLoginToken { token }, which answers the same way
 *   updateLoginToken arrives once the phone confirmed: call
 *   auth.exportLoginToken again for the answer.
 *   SESSION_PASSWORD_NEEDED (2-Step Verification) goes on to the password
 *   step, the same one the phone-number sign-in has.
 *
 * The controller has the shape of the phone sign-in's (`state`, `account`,
 * `session`, `submitPassword`, `cancel`), so the routes treat both alike.
 * Never logged or returned except the code's own URL: the token, the
 * session, the password.
 */

import {
  createLoginLifetime,
  deferredLoginInput,
  waitForLogin,
} from './telegram-login-lifecycle.js';

/** The URL a phone scans: the token as base64url. */
export const loginUrl = (token) =>
  `tg://login?token=${Buffer.from(token).toString('base64url')}`;

const qrLifetime = (client, ctrl, options) =>
  createLoginLifetime(client, {
    ...options,
    onStop: (error) => {
      ctrl.cancelled = true;
      ctrl.state = error.code === 'LOGIN_CANCELLED' ? 'cancelled' : 'error';
      ctrl.error = error;
      ctrl.url = null;
      ctrl.expires = 0;
      ctrl.account = null;
      ctrl.session = null;
      ctrl.password?.reject(error);
    },
  });

/**
 * Start a QR sign-in on `client` (a GramJS-like client, not yet connected).
 * `Api` is GramJS's constructor namespace, `accountOf` names the account.
 * The returned controller's `state` is 'qr' (show `url`), 'password',
 * 'checking' (the password is being checked), 'done' or 'error'.
 */
export const startQrLogin = async ({
  client,
  apiId,
  apiHash,
  Api,
  accountOf,
  now = () => Date.now(),
  // Ask for a fresh code this long before it expires, and at the latest
  // this long after the last one (clock differences with Telegram).
  margin = 2000,
  maxAge = 25000,
  pollMs = 25,
  timeoutMs = 300_000,
  debug = false,
  log,
}) => {
  const ctrl = {
    state: 'qr',
    url: null,
    expires: 0,
    fetchedAt: 0,
    error: null,
    account: null,
    session: null,
    password: null,
    cancelled: false,
  };
  let inflight = null;
  const lifetime = qrLifetime(client, ctrl, { timeoutMs, debug, log });

  const fail = async (error) => {
    if (!lifetime.stopped) {
      await lifetime.stop(error);
    }
  };

  const finish = async (user) => {
    lifetime.check();
    const session = client.session.save();
    const account = accountOf(user);
    await lifetime.close();
    lifetime.check();
    ctrl.session = session;
    ctrl.account = account;
    ctrl.url = null;
    ctrl.expires = 0;
    ctrl.state = 'done';
  };

  // 2-Step Verification: GramJS asks for the password through a callback;
  // a wrong one comes back to onError and is asked for again.
  const askPassword = () => {
    ctrl.state = 'password';
    lifetime
      .run(() =>
        client.signInWithPassword(
          { apiId: Number(apiId), apiHash },
          {
            password: async () => {
              lifetime.check();
              ctrl.password = deferredLoginInput();
              ctrl.state = 'password';
              return lifetime.run(() => ctrl.password.promise);
            },
            onError: async (error) => {
              ctrl.error = error;
              return ctrl.cancelled;
            },
          }
        )
      )
      .then(finish)
      .catch(fail)
      .catch(() => {});
  };

  const exchange = async (request) => {
    const answer = await lifetime.run(() => client.invoke(request));
    lifetime.check();
    if (answer?.className !== 'auth.LoginTokenMigrateTo') {
      return answer;
    }
    // The account lives on another data centre: go there, import the token.
    await lifetime.run(() => client._switchDC(answer.dcId));
    lifetime.check();
    return lifetime.run(() =>
      client.invoke(new Api.auth.ImportLoginToken({ token: answer.token }))
    );
  };

  const apply = async (answer) => {
    lifetime.check();
    if (answer?.className === 'auth.LoginToken') {
      ctrl.url = loginUrl(answer.token);
      ctrl.expires = Number(answer.expires);
      ctrl.fetchedAt = now();
    } else if (answer?.className === 'auth.LoginTokenSuccess') {
      await finish(answer.authorization?.user);
    } else {
      throw new Error('unexpected answer to the QR login');
    }
  };

  const refresh = () => {
    inflight ??= (async () => {
      try {
        await apply(
          await exchange(
            new Api.auth.ExportLoginToken({
              apiId: Number(apiId),
              apiHash,
              exceptIds: [],
            })
          )
        );
      } catch (error) {
        if (
          !lifetime.stopped &&
          error?.errorMessage === 'SESSION_PASSWORD_NEEDED'
        ) {
          askPassword();
        } else {
          await fail(error);
        }
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  };

  const stale = () =>
    ctrl.url === null ||
    now() >= Math.min(ctrl.expires * 1000 - margin, ctrl.fetchedAt + maxAge);

  try {
    await lifetime.run(() => client.connect());
    client.addEventHandler?.((update) => {
      // The phone confirmed: the next export answers with the account.
      if (update?.className === 'UpdateLoginToken' && ctrl.state === 'qr') {
        refresh()
          .catch(fail)
          .catch(() => {});
      }
    });
    await refresh();
    lifetime.check();
  } catch (error) {
    await fail(error);
    throw error;
  }

  return controllerOf({
    ctrl,
    lifetime,
    refresh,
    stale,
    pending: () => inflight,
    settle: (want) => waitForLogin(ctrl, lifetime, want, pollMs),
  });
};

const controllerOf = ({ ctrl, lifetime, refresh, stale, pending, settle }) => ({
  get state() {
    return ctrl.state;
  },
  get url() {
    return ctrl.url;
  },
  get expires() {
    return ctrl.expires;
  },
  get account() {
    return ctrl.account;
  },
  get session() {
    return ctrl.session;
  },
  // One poll: renew an expiring code, wait for an export in flight.
  async status() {
    lifetime.check();
    if (ctrl.state === 'qr' && stale()) {
      await refresh();
    } else if (pending()) {
      await pending();
    }
    if (ctrl.state === 'error') {
      throw ctrl.error;
    }
    return ctrl.state;
  },
  async submitPassword(value) {
    if (ctrl.state !== 'password' || !ctrl.password) {
      throw new Error('no password is asked for now');
    }
    ctrl.error = null;
    ctrl.state = 'checking';
    ctrl.password.resolve(String(value));
    return settle('checking');
  },
  async cancel() {
    await (ctrl.state === 'done' ? lifetime.close() : lifetime.stop());
  },
});
