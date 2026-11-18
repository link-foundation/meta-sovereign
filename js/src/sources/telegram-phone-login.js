import {
  createLoginLifetime,
  deferredLoginInput,
  loginError,
  waitForLogin,
} from './telegram-login-lifecycle.js';

export const startPhoneLogin = ({ client, phone, accountOf, ...options }) => {
  const ctrl = { state: 'starting', error: null, account: null, session: null };
  let input = null;
  const lifetime = createLoginLifetime(client, {
    ...options,
    onStop: (error) => {
      ctrl.state = error.code === 'LOGIN_CANCELLED' ? 'cancelled' : 'error';
      ctrl.error = error;
      ctrl.session = null;
      ctrl.account = null;
      input?.reject(error);
    },
  });
  const prompt = (state) => {
    lifetime.check();
    const pending = deferredLoginInput();
    input = pending;
    ctrl.state = state;
    return lifetime.run(() => pending.promise);
  };
  lifetime
    .run(async () => {
      await client.start({
        phoneNumber: async () => {
          lifetime.check();
          return phone;
        },
        phoneCode: () => prompt('code'),
        password: () => prompt('password'),
        onError: (error) => {
          ctrl.error = error;
          return Boolean(lifetime.stopped);
        },
      });
      lifetime.check();
      const account = accountOf(await lifetime.run(() => client.getMe()));
      lifetime.check();
      const session = client.session.save();
      await lifetime.close();
      lifetime.check();
      ctrl.account = account;
      ctrl.session = session;
      ctrl.state = 'done';
    })
    .catch(async (error) => {
      if (!lifetime.stopped) {
        await lifetime.stop(error);
      }
    })
    .catch(() => {});
  const submit = async (state, value) => {
    lifetime.check();
    if (ctrl.state !== state || !input) {
      throw loginError('LOGIN_STEP', `no ${state} is asked for now`);
    }
    if (typeof value !== 'string' || !value || value.length > 1024) {
      throw loginError('LOGIN_INPUT', `a ${state} is required`);
    }
    ctrl.error = null;
    ctrl.state = 'checking';
    input.resolve(value);
    return waitForLogin(ctrl, lifetime, 'checking');
  };
  return {
    get state() {
      return ctrl.state;
    },
    get account() {
      return ctrl.account;
    },
    get session() {
      return ctrl.session;
    },
    ready: () => waitForLogin(ctrl, lifetime, 'starting'),
    submitCode: (value) => submit('code', value),
    submitPassword: (value) => submit('password', value),
    cancel: () => (ctrl.state === 'done' ? lifetime.close() : lifetime.stop()),
  };
};
