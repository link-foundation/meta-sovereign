/** Synthetic dedicated survey; application and questionnaire controls stay real. */
export const changeApplicationFeedbackFixture = (kind) => {
  document.querySelector('#feedback-fixture')?.remove();
  const host = document.createElement('section');
  host.id = 'feedback-fixture';
  host.innerHTML = `<div role="dialog" aria-label="Viewed vacancy"><p>You've viewed the vacancy but haven't applied. Why?</p><label><input type="radio" name="reason" data-qa="vacancy-feedback__reason-MAYBE_LATER">Maybe I'll apply later</label><label><input type="radio" name="reason" id="owner-reason">Another reason</label><button type="button" data-qa="vacancy-feedback__close">Close survey</button></div>`;
  const dialog = host.firstElementChild;
  const option = host.querySelector('input');
  const close = host.querySelector('button');
  globalThis.feedbackFixture ??= {
    selections: 0,
    closes: 0,
    challengeReads: 0,
  };
  const challenge = () => {
    const input = document.createElement('input');
    input.setAttribute('data-qa', 'account-captcha-input');
    Object.defineProperty(input, 'value', {
      get() {
        globalThis.feedbackFixture.challengeReads++;
        throw new Error('Challenge contents must stay private');
      },
    });
    host.append(input);
  };
  option.onclick = () => {
    globalThis.feedbackFixture.selections++;
    if (kind === 'late-challenge') {
      challenge();
    }
    if (kind === 'changed-close') {
      close.type = 'submit';
    }
  };
  close.onclick = () => {
    globalThis.feedbackFixture.closes++;
    dialog.remove();
  };
  if (kind === 'owner') {
    host.querySelector('#owner-reason').checked = true;
  }
  if (kind === 'selected') {
    option.checked = true;
  }
  if (kind === 'challenge') {
    challenge();
  }
  if (kind === 'daily-limit') {
    const limit = document.createElement('aside');
    limit.setAttribute(
      'data-qa-popup-error-code',
      'negotiations-limit-exceeded'
    );
    limit.textContent = 'Daily applications limit';
    host.append(limit);
  }
  if (kind === 'shared-reason') {
    const reason = document.createElement('input');
    reason.type = 'radio';
    reason.name = 'reason';
    reason.checked = true;
    host.append(reason);
  }
  if (kind === 'hidden') {
    dialog.hidden = true;
  }
  if (kind === 'ambiguous') {
    dialog.append(close.cloneNode(true));
  }
  if (kind === 'unsafe-close') {
    close.type = 'submit';
  }
  document.body.append(host);
};

export const readApplicationFeedbackFixture = () => ({
  ...globalThis.feedbackFixture,
  option:
    document.querySelector('[data-qa="vacancy-feedback__reason-MAYBE_LATER"]')
      ?.checked ?? null,
  owner: document.querySelector('#owner-reason')?.checked ?? null,
  dialogs: document.querySelectorAll('#feedback-fixture [role="dialog"]')
    .length,
  entries: globalThis.applicationEntries,
  submissions: globalThis.applicationAttempts,
});
