// Message effects (R-Y149): the routes of the POSTS table in
// routes-telegram.js. The send itself carries `effect` (a decimal
// string) through /api/send; see `validEffect`.

import { EFFECT_ID } from '../sources/telegram-effects.js';

/** Whether a send's `effect` is absent or a decimal string of a long. */
export const validEffect = (effect) =>
  effect === undefined ||
  (typeof effect === 'string' && EFFECT_ID.test(effect));

export const EFFECTS_POSTS = {
  effects: async (account) =>
    typeof account.availableEffects === 'function'
      ? [200, await account.availableEffects()]
      : [400, { error: 'effects not available', code: 'bad-request' }],
};
