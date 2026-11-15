import { acquaintanceServer } from '../../../experiments/issue-56/vk-acquaintance-fixture.mjs';
import { verifyVkTextReply } from './e2e-vk-text-reply.mjs';
export const verifyVkAcquaintance = (browser, options) =>
  verifyVkTextReply(browser, acquaintanceServer, 'acquaintance', options);
