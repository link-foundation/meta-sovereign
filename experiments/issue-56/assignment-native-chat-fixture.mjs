import { makeBrowserCommander } from 'browser-commander';
import { captureHhConversation } from '../../js/src/sources/auto-import/hh.js';
import { conversationHistoryHtml } from './conversation-history-fixture.mjs';
import { hhApplicationHtml, hhChoiceHtml } from './hh-choice-fixture.mjs';
import { vacancyId } from './assignment-vacancy-fixture.mjs';

const vacancyHeader = (visibility) => {
  const origin =
    visibility === 'foreign'
      ? 'https://hh.ru.fixture.invalid'
      : 'https://www.hh.ru';
  return `<header ${visibility === 'hidden' ? 'hidden' : ''}><b data-qa="participant-info-title">Fixture employer</b><p data-qa="chatik-header-sub-header"><a href="${origin}/vacancy/${vacancyId}?from=chat">Python engineer</a></p></header>`;
};

const formAnchor = (formUrl) =>
  `<a href="${formUrl.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')}">Application form</a>`;

export const nativeAssignmentChatHtml = (
  formUrl,
  { history = false, header = 'visible' } = {}
) => {
  const link = formAnchor(formUrl);
  const html = history
    ? conversationHistoryHtml().replace(
        "'Conversation record '+index",
        `(index===1?${JSON.stringify(link)}:'Conversation record '+index)`
      )
    : hhChoiceHtml.replace('Do you have distributed systems experience?', link);
  return html.replace('<h1>', `${vacancyHeader(header)}<h1>`);
};

export const captureNativeAssignmentChat = async (
  browser,
  store,
  formUrl,
  { history = false, nested = false, header = 'visible' } = {}
) => {
  const context = await browser.newContext();
  const errors = [];
  try {
    await context.route('**/*', (route) => {
      const path = new URL(route.request().url()).pathname;
      return route.fulfill({
        contentType: 'text/html',
        body:
          nested && path === '/chat'
            ? hhApplicationHtml()
            : nativeAssignmentChatHtml(formUrl, { history, header }),
      });
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`https://hh.ru/chat${nested ? '' : '/7'}`);
    const provider = nested ? page.frameLocator('iframe') : page;
    const composer = provider.locator('textarea');
    await composer.waitFor();
    const before = await composer.inputValue();
    const commander = makeBrowserCommander({
      page,
      enableNetworkTracking: false,
      enableNavigationManager: false,
      enableDialogManager: false,
    });
    try {
      const evidence = await captureHhConversation(
        store,
        { commander, page },
        { signal: new AbortController().signal, history }
      );
      const counters = await composer.evaluate((node) => ({
        value: node.value,
        clicks: globalThis.fixture.clicks,
        sends: globalThis.fixture.textSends ?? globalThis.fixture.sends,
      }));
      return { evidence, before, counters, errors };
    } finally {
      await commander.destroy();
    }
  } finally {
    await context.close();
  }
};
