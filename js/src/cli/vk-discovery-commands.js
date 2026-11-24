import { createVkFriendPolicyCommands } from './vk-friends-commands.js';
import { createVkDiscoveryJob } from '../automation/vk-discovery.js';
import {
  discoveryKinds,
  discoveryPolicies,
  discoveryBooleans,
  discoveryFields,
} from '../automation/vk-discovery-settings.js';
const dashed = (key) =>
  key.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
export const createVkDiscoveryCommands = (options) =>
  Object.assign(
    {},
    ...discoveryKinds.map((kind) => {
      const policy = discoveryPolicies[kind];
      return createVkFriendPolicyCommands({
        name: `vk-${kind}`,
        load: policy.load,
        save: policy.save,
        createJob: (input) => createVkDiscoveryJob({ ...input, kind }),
        flags: Object.fromEntries(
          Object.keys(discoveryFields[kind]).map((key) => [dashed(key), key])
        ),
        booleanFlags: Object.fromEntries(
          discoveryBooleans[kind].map((key) => [dashed(key), key])
        ),
        ...options,
      });
    })
  );
