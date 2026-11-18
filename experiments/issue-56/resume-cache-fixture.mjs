import { choicePutFixture } from './choice-put-fixture.mjs';

/** A refused native résumé refresh against the real snapshot store. */
export const resumeCacheFixture = async (browser) => {
  const fixture = await choicePutFixture(browser);
  return {
    ...fixture,
    failNext: () => {
      fixture.mode('english-only');
      fixture.failNext();
    },
  };
};
