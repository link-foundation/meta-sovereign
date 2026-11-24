import assert from 'node:assert/strict';
import { ApplicationChats } from '../../src/jobs/application-chats.js';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import {
  chatNavigationHtml,
  unreadBotQuestion,
} from '../../../experiments/issue-56/chat-navigation-fixture.mjs';
import { withChatNavigationFixture } from './e2e-chat-navigation.mjs';

const fixtureCookie = {
  name: 'application_fixture',
  value: 'fixture-owner',
  domain: '.hh.ru',
  path: '/',
  secure: true,
  httpOnly: true,
};
export const signInFixture = (context) => context.addCookies([fixtureCookie]);

const loginPage = (route) =>
  route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><main><h1>Synthetic HeadHunter sign-in</h1><form action="/account/login" data-qa="account-login-form"><label>Email <input type="email"></label><button data-qa="account-login-submit">Sign in</button></form></main><script>history.replaceState(null, "", "/account/login");</script>',
  });

export const signedOutRoute = async (route, context) => {
  const { pathname } = new URL(route.request().url());
  if (pathname === '/account/login') {
    await loginPage(route);
    return true;
  }
  if (pathname === '/chat') {
    // Some routed engines omit Cookie from the intercepted request headers.
    const signedIn = context
      ? (await context.cookies(route.request().url())).some(
          ({ name, value }) =>
            name === fixtureCookie.name && value === fixtureCookie.value
        )
      : (await route.request().allHeaders()).cookie
          ?.split('; ')
          .includes(`${fixtureCookie.name}=${fixtureCookie.value}`);
    if (!signedIn) {
      await loginPage(route);
      return true;
    }
  }
  return false;
};

/** Shared isolated native fixture for direct and independent MCP UI checks. */
export const withNativeApplicationChats = (
  browser,
  work,
  { choices, session = false, waiting = false, rejections = false } = {}
) =>
  withChatNavigationFixture(
    browser,
    {
      html: chatNavigationHtml({
        textReplies: true,
        precedingOutgoing: true,
        ...(waiting
          ? { allRead: true, hiddenChats: ['8'], outgoingChats: ['7', '9'] }
          : {}),
        ...(choices
          ? { choiceChat: '8', latestMessages: { 8: unreadBotQuestion } }
          : {}),
        ...(rejections && {
          listPreviews: {
            9: 'We will not move forward with your application.',
          },
          latestMessages: {
            ...(choices && { 8: unreadBotQuestion }),
            9: 'We will not move forward with your application.',
          },
          ...(choices && {
            listChats: ['8', '9', '10', '7'],
            unreadChats: ['8', '9', '10'],
          }),
        }),
      }),
      senderOptions: { slot: 'chat-slot' },
      routePage: session ? signedOutRoute : undefined,
    },
    async ({ sender, page: chat }) => {
      let child;
      let chatStats = { chat: null };
      const stats = async () => {
        if (!chat.isClosed()) {
          chatStats = await chat.evaluate(
            ({ waiting, rejections }) => {
              const state = window.fixture;
              if (!state) {
                return { chat: null };
              }
              const draft = document.querySelector('textarea').value;
              return {
                chat: {
                  sends: state.sends,
                  unreadNext: state.unread['9'],
                  draft,
                },
                ...(waiting
                  ? {
                      waiting: {
                        visits: state.visits.slice(),
                        unread: state.unread['8'],
                        draft,
                        sends: state.sends,
                      },
                    }
                  : {}),
                ...(rejections && {
                  rejections: {
                    visits: state.visits.slice(),
                    unread: state.unread['9'],
                    unrelated: state.unread['10'],
                    ownerDraft: state.drafts['7'],
                  },
                }),
              };
            },
            { waiting, rejections }
          );
        }
        return {
          ...chatStats,
          child: child?.status() ?? null,
          logs,
          liveProvider: false,
        };
      };
      const logs = [];
      const fixture = await applicationNativeFixture(browser, {
        vacancyIds: ['123', '456'],
        prepareContext: session ? signInFixture : undefined,
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
