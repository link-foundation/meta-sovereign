import {
  messageDefaultsServer,
  messageDefaultPolicies,
} from './vk-message-defaults-fixture.mjs';

export const legacyCatalogsServer = async ({ invalid = false } = {}) => {
  const fixture = await messageDefaultsServer();
  try {
    for (const [name, policy] of Object.entries(messageDefaultPolicies)) {
      const saved = await policy.settings(fixture.store);
      await fixture.store.put({
        id: policy.keys.job,
        ...saved,
        messages: invalid ? { unexpected: 42 } : saved.messages.split('\n'),
        attachments: {},
        ...(name === 'wall' ? { communities: [42, 43] } : { stickers: 60302 }),
      });
    }
    return fixture;
  } catch (error) {
    await fixture.close();
    throw error;
  }
};
