import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reuseApplicationChatSession } from '../src/jobs/application-chat-session.js';

const fixtureCookie = {
  name: 'application_fixture',
  value: 'fixture-owner',
  domain: '.hh.ru',
  path: '/',
  secure: true,
};

const nativePage = ({ url, state, cookies = [] }) => {
  const writes = [];
  const context = {
    pages: () => [page],
    cookies: async () => cookies,
    addCookies: async (values) => writes.push(values.map(({ name }) => name)),
  };
  const page = {
    url: () => url,
    isClosed: () => false,
    context: () => context,
    evaluate: async () => state,
  };
  return { page, context, writes };
};

test('only secure HeadHunter cookies reach a different owned signed-out context', async () => {
  const source = nativePage({
    url: 'https://hh.ru/vacancy/1',
    state: 'in',
    cookies: [
      fixtureCookie,
      { ...fixtureCookie, name: 'foreign', domain: 'not-hh.example' },
      { ...fixtureCookie, name: 'insecure', secure: false },
      { ...fixtureCookie, name: 'other-app', domain: 'rating.hh.ru' },
    ],
  });
  const target = nativePage({
    url: 'https://hh.ru/account/login',
    state: 'out',
  });
  assert.equal(
    await reuseApplicationChatSession({
      applicationPage: () => source.page,
      destination: target.page,
      signal: new AbortController().signal,
      waitMs: 0,
    }),
    true
  );
  assert.deepEqual(target.writes, [['application_fixture']]);
  assert.deepEqual(source.writes, []);
});

test('session reuse preserves a signed-in account, an uncertain login and other tabs', async () => {
  const source = nativePage({
    url: 'https://hh.ru/vacancy/1',
    state: 'in',
    cookies: [fixtureCookie],
  });
  let cookieReads = 0;
  source.context.cookies = async () => {
    cookieReads++;
    return [fixtureCookie];
  };
  const otherTab = nativePage({ url: 'https://hh.ru/chat/7', state: 'in' });
  const multiple = nativePage({
    url: 'https://hh.ru/account/login',
    state: 'out',
  });
  multiple.context.pages = () => [multiple.page, otherTab.page];
  const sameContext = nativePage({
    url: 'https://hh.ru/account/login',
    state: 'out',
  });
  sameContext.page.context = () => source.context;
  const targets = [
    nativePage({ url: 'https://hh.ru/chat', state: 'in' }),
    nativePage({ url: 'https://hh.ru/account/login', state: null }),
    nativePage({ url: 'https://other.example/account/login', state: 'out' }),
    nativePage({ url: 'https://hh.ru/chat/7', state: 'out' }),
    multiple,
    sameContext,
  ];
  for (const target of targets) {
    assert.equal(
      await reuseApplicationChatSession({
        applicationPage: () => source.page,
        destination: target.page,
        signal: new AbortController().signal,
        waitMs: 0,
      }),
      false
    );
    assert.deepEqual(target.writes, []);
  }
  assert.equal(cookieReads, 0);
  assert.deepEqual(source.writes, []);
});

test('replacing the batch application during the cookie read prevents handoff', async () => {
  const source = nativePage({ url: 'https://hh.ru/vacancy/1', state: 'in' });
  const target = nativePage({
    url: 'https://hh.ru/account/login',
    state: 'out',
  });
  let owned = source.page;
  source.context.cookies = async () => {
    owned = null;
    return [fixtureCookie];
  };
  assert.equal(
    await reuseApplicationChatSession({
      applicationPage: () => owned,
      destination: target.page,
      signal: new AbortController().signal,
      waitMs: 0,
    }),
    false
  );
  assert.deepEqual(target.writes, []);
});

test('stopping drains a session handoff waiting for its application', async () => {
  const controller = new AbortController();
  const target = nativePage({
    url: 'https://hh.ru/account/login',
    state: 'out',
  });
  const waiting = reuseApplicationChatSession({
    applicationPage: () => null,
    destination: target.page,
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(waiting, { name: 'AbortError' });
  assert.deepEqual(target.writes, []);
});
