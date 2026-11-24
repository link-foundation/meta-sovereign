import { contextualServer } from '../../../experiments/issue-56/vk-contextual-fixture.mjs';
import { verifyVkTextReply } from './e2e-vk-text-reply.mjs';
export const verifyVkContextual = (browser, kind, options) =>
  verifyVkTextReply(browser, () => contextualServer(kind), kind, options);
