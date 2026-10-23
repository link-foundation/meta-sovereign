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

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const sleep = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));

/** The URL a phone scans: the token as base64url. */
export const loginUrl = (token) =>
  `tg://login?token=${Buffer.from(token).toString('base64url')}`;

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

  const finish = async (user) => {
    ctrl.session = client.session.save();
    ctrl.account = accountOf(user);
    ctrl.state = 'done';
    await client.disconnect?.();
  };

  // 2-Step Verification: GramJS asks for the password through a callback;
  // a wrong one comes back to onError and is asked for again.
  const askPassword = () => {
    ctrl.state = 'password';
    client
      .signInWithPassword(
        { apiId: Number(apiId), apiHash },
        {
          password: async () => {
            ctrl.state = 'password';
            ctrl.password = deferred();
            return ctrl.password.promise;
          },
          onError: async (error) => {
            ctrl.error = error;
            return ctrl.cancelled;
          },
        }
      )
      .then(finish)
      .catch((error) => {
        ctrl.error = ctrl.error ?? error;
        ctrl.state = 'error';
      });
  };

  const exchange = async (request) => {
    const answer = await client.invoke(request);
    if (answer?.className !== 'auth.LoginTokenMigrateTo') {
      return answer;
    }
    // The account lives on another data centre: go there, import the token.
    await client._switchDC(answer.dcId);
    return client.invoke(
      new Api.auth.ImportLoginToken({ token: answer.token })
    );
  };

  const apply = async (answer) => {
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
        if (error?.errorMessage === 'SESSION_PASSWORD_NEEDED') {
          askPassword();
        } else {
          ctrl.error = error;
          ctrl.state = 'error';
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

  const fail = async (error) => {
    await client.disconnect?.();
    throw error;
  };

  await client.connect();
  client.addEventHandler?.((update) => {
    // The phone confirmed: the next export answers with the account.
    if (update?.className === 'UpdateLoginToken' && ctrl.state === 'qr') {
      refresh();
    }
  });
  await refresh();
  if (ctrl.state === 'error') {
    return fail(ctrl.error);
  }

  return controllerOf({
    ctrl,
    client,
    refresh,
    stale,
    pending: () => inflight,
    settle: settleFor(ctrl, now, pollMs),
  });
};

// Wait while the state is `want`; a wrong password is thrown once.
const settleFor = (ctrl, now, pollMs) => async (want) => {
  const deadline = now() + 60000;
  while (ctrl.state === want && now() < deadline) {
    await sleep(pollMs);
  }
  if (ctrl.error) {
    const error = ctrl.error;
    ctrl.error = null;
    throw error;
  }
  return ctrl.state;
};

const controllerOf = ({ ctrl, client, refresh, stale, pending, settle }) => ({
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
    ctrl.cancelled = true;
    ctrl.password?.reject(new Error('cancelled'));
    await client.disconnect?.();
  },
});
