import { identityServer } from '../../../experiments/issue-56/vk-identity-fixture.mjs';
import { verifyVkTextReply } from './e2e-vk-text-reply.mjs';
export const verifyVkIdentity = (browser, options) =>
  verifyVkTextReply(browser, identityServer, 'identity', options);
