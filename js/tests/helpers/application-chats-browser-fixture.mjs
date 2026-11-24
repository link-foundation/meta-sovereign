import assert from 'node:assert/strict';
import { ApplicationChats } from '../../src/jobs/application-chats.js';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import {
  chatNavigationHtml,
  unreadBotQuestion,
} from '../../../experiments/issue-56/chat-navigation-fixture.mjs';
import { withChatNavigationFixture } from './e2e-chat-navigation.mjs';

/** Shared isolated native fixture for direct and independent MCP UI checks. */
export const withNativeApplicationChats = (browser, work, { choices } = {}) =>
  withChatNavigationFixture(
    browser,
    {
      html: chatNavigationHtml({
        textReplies: true,
        precedingOutgoing: true,
        ...(choices
          ? { choiceChat: '8', latestMessages: { 8: unreadBotQuestion } }
          : {}),
      }),
      senderOptions: { slot: 'chat-slot' },
    },
    async ({ sender, page: chat }) => {
      let child;
      let chatStats;
      const stats = async () => {
        if (!chat.isClosed()) {
          chatStats = await chat.evaluate(() => ({
            sends: window.fixture.sends,
            unreadNext: window.fixture.unread['9'],
            draft: document.querySelector('textarea').value,
          }));
        }
        return {
          chat: chatStats,
          child: child?.status() ?? null,
          logs,
          liveProvider: false,
        };
      };
      const logs = [];
      const fixture = await applicationNativeFixture(browser, {
        vacancyIds: ['123', '456'],
        application: {
          createChats: () => {
            child = new ApplicationChats({
              store: fixture.store,
              sender: (options) => {
                assert.equal(options.slot, 'chat-slot');
                return {
                  ...sender,
                  close: async () => {
                    await stats();
                    await sender.close();
                  },
                };
              },
              log: (entry) => logs.push(entry),
            });
            return child;
          },
        },
      });
      try {
        return await work({ fixture, chat, logs, stats, child: () => child });
      } finally {
        await fixture.close();
      }
    }
  );
