import { wallServer } from './vk-wall-fixture.mjs';
import { wallPolicy } from '../../js/src/automation/vk-wall-settings.js';
import { vkBirthdaySettings } from '../../js/src/automation/vk-birthday-settings.js';

export const messageDefaultPolicies = {
  wall: wallPolicy,
  birthday: vkBirthdaySettings,
};
export const messageDefaultsServer = async () => {
  const fixture = await wallServer();
  try {
    for (const [name, policy] of Object.entries(messageDefaultPolicies)) {
      await policy.save(fixture.store, {
        ...(await policy.settings(fixture.store)),
        messages: `Owner ${name}: first\nOwner ${name}: second`,
        ...(name === 'wall'
          ? {
              marker: 'Owner wall:',
              restrictedMessage: 'Owner wall: restricted',
            }
          : {}),
        limit: 13,
      });
    }
    return fixture;
  } catch (error) {
    await fixture.close();
    throw error;
  }
};
