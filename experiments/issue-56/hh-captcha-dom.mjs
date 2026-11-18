/** Synthetic HH text gate. No answer or solver is exposed to product routes. */
export const changeHhCaptchaFixture = ({
  marker = 'qa',
  hidden = false,
  clear = false,
} = {}) => {
  document.querySelector('#hh-captcha-fixture')?.remove();
  if (clear) {
    return;
  }
  const form = document.querySelector('#native-form');
  const dialog = document.createElement('section');
  dialog.id = 'hh-captcha-fixture';
  dialog.setAttribute('role', 'dialog');
  dialog.hidden = hidden;
  dialog.innerHTML =
    '<h2>Private synthetic verification instructions</h2><label>Verification answer<input type="text"></label><input type="hidden" name="smart-token" value="synthetic-completed-widget-token"><button type="button" data-fixture-captcha-close>Close verification</button><button type="button" data-fixture-captcha-renew>Renew verification</button><button type="button" data-fixture-captcha-submit>Submit verification</button>';
  const input = dialog.querySelector('input');
  if (marker === 'qa') {
    input.setAttribute('data-qa', 'account-captcha-input');
  } else {
    input.name = 'captchaText';
  }
  globalThis.hhCaptchaCounters = {
    answerReads: 0,
    htmlReads: 0,
    closes: 0,
    renews: 0,
    submits: 0,
  };
  const value = Object.getOwnPropertyDescriptor(
    globalThis.HTMLInputElement.prototype,
    'value'
  );
  value.set.call(input, 'Owner-only synthetic verification answer');
  Object.defineProperty(input, 'value', {
    get() {
      globalThis.hhCaptchaCounters.answerReads++;
      return value.get.call(this);
    },
  });
  const html = Object.getOwnPropertyDescriptor(
    globalThis.Element.prototype,
    'outerHTML'
  );
  Object.defineProperty(form, 'outerHTML', {
    configurable: true,
    get() {
      const current = document.querySelector('#hh-captcha-fixture');
      if (current && !current.hidden) {
        globalThis.hhCaptchaCounters.htmlReads++;
      }
      return html.get.call(this);
    },
  });
  for (const [name, counter] of [
    ['close', 'closes'],
    ['renew', 'renews'],
    ['submit', 'submits'],
  ]) {
    dialog.querySelector(`[data-fixture-captcha-${name}]`).onclick = () =>
      globalThis.hhCaptchaCounters[counter]++;
  }
  form.append(dialog);
};

export const hhCaptchaCounters = () => ({
  ...globalThis.hhCaptchaCounters,
  entries: globalThis.applicationEntries,
  sends: globalThis.applicationAttempts,
});
