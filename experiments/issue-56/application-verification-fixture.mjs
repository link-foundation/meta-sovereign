import { applicationNativeFixture } from './application-native-fixture.mjs';
import {
  nativeApplicationForm,
  nativeApplicationReviewRequest,
} from '../../js/tests/helpers/application-native-request.mjs';

/** Synthetic verification marks a private control whose value is never read. */
export const addApplicationVerification = (nested) => {
  const { document: doc } = globalThis;
  globalThis.challengeReads = 0;
  const challenge = doc.createElement(nested ? 'iframe' : 'section');
  challenge.id = 'manual-verification';
  let gate = challenge;
  doc.querySelector('#native-form').prepend(challenge);
  if (nested) {
    challenge.title = 'Manual verification';
    gate = challenge.contentDocument.body;
  }
  gate.className = 'smart-captcha';
  gate.innerHTML =
    '<p>Private verification instructions</p><label>Challenge answer <input name="fixture-answer" value="private-owner-answer"></label>';
  Object.defineProperty(gate.querySelector('input'), 'value', {
    get() {
      globalThis.challengeReads++;
      throw new Error('Private challenge answer was read');
    },
  });
};

export const clearApplicationVerification = () => {
  globalThis.document.querySelector('#manual-verification').remove();
};

export const openApplicationVerification = async (browser) => {
  const fixture = await applicationNativeFixture(browser);
  const action = (operation, receipt, extra) =>
    nativeApplicationReviewRequest(fixture, operation, receipt, extra);
  try {
    let receipt = await action('open', null, {
      headless: false,
      browserSlot: 'interview',
    });
    receipt = await action('advance', receipt, {
      browserSlot: 'interview',
      action: 'enter',
      confirm: true,
    });
    return { fixture, owner: nativeApplicationForm(browser), receipt, action };
  } catch (error) {
    await fixture.close();
    throw error;
  }
};
