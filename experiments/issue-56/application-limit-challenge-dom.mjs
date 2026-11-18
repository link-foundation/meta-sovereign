/** Synthetic native gate only: no provider account, remote challenge or answer. */
export const mountApplicationLimitChallenge = () => {
  globalThis.limitCaptchaCloses ??= 0;
  globalThis.limitCaptchaActions ??= 0;
  const dialog = document.createElement('section');
  dialog.id = 'limit-captcha';
  dialog.setAttribute('role', 'dialog');
  dialog.innerHTML =
    '<h2 id="challenge-prose">Manual verification</h2><form><button type="button" aria-label="Close"><svg></svg></button><input name="captchaText" data-qa="account-captcha-input"><button type="button" data-qa="captcha-renew-text">Other text</button><button type="submit">Verify</button></form>';
  document.body.append(dialog);
  for (const [node, key] of [
    [dialog.querySelector('input'), 'value'],
    [dialog.querySelector('h2'), 'textContent'],
  ]) {
    Object.defineProperty(node, key, {
      configurable: true,
      get() {
        throw new Error('Challenge content must not be read.');
      },
    });
  }
  dialog.querySelector('[aria-label="Close"]').onclick = () => {
    globalThis.limitCaptchaCloses++;
    dialog.remove();
  };
  dialog.querySelector('[data-qa="captcha-renew-text"]').onclick = () =>
    globalThis.limitCaptchaActions++;
  dialog.querySelector('form').onsubmit = (event) => {
    event.preventDefault();
    globalThis.limitCaptchaActions++;
  };
};
