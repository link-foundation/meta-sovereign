import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  questionBrowserFixture,
  browserQuestion,
} from './question-browser-fixture.mjs';

export const unreadInput = (extra = {}) => ({
  id: `question-unread:${randomUUID()}`,
  source: 'hh',
  confirm: true,
  maxChats: 2,
  ...extra,
});
export const unreadPass = () => ({
  conversations: [{ chat: '8', question: { ...browserQuestion(), chat: '8' } }],
  coverage: {
    complete: false,
    scope: 'unread-conversations',
    reason: 'observed-list',
    observed: 1,
    visited: 1,
  },
  restoration: { restored: true, reason: 'checked' },
});
export const unreadReviewFixture = async (scan = async () => unreadPass()) => {
  const env = await questionBrowserFixture();
  env.state.scans = [];
  env.send.unreadConversationSources = () => [{ id: 'hh', name: 'HeadHunter' }];
  env.send.scanUnreadConversations = async (options) => {
    env.state.scans.push(options);
    return scan(options, env);
  };
  return env;
};
export const waitUnreadReview = async (browser, id) => {
  for (let i = 0; i < 100; i++) {
    const status = await browser.unreadStatus({ id });
    if (status.state !== 'active') {
      return status;
    }
    await delay(5);
  }
  throw new Error('The finite mock unread pass did not settle');
};
