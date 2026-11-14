import { reserveApplicationField } from './application-field.js';

export const id = '0017-application-language-policy';
export const from = 16;
export const to = 17;
export const description =
  'Reserve frozen application language settings and acknowledged standard letters without rewriting legacy intent.';
export const up = async (ctx) => {
  for (const [key, option] of [
    ['autoSelectResumeLanguage', true],
    ['standardLetters', true],
    ['letterTemplate', false],
  ]) {
    await reserveApplicationField(ctx, {
      to,
      key,
      option,
      code: 'APPLICATION_LANGUAGE_POLICY_COLLISION',
    });
  }
};
