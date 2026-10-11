import { describe, it, expect } from 'test-anywhere';

import {
  VK_OAUTH_GATE_OUTCOMES,
  VK_TOKEN_SOURCES,
  VK_USER_SCOPE_BITS,
  buildVkAuthorizeUrl,
  classifyVkOAuthGate,
  decodeVkUserScope,
  describeVkError,
  inspectVkToken,
  probeVkOAuthGate,
  rankVkTokenSources,
} from '../src/sources/vk-auth.js';
import { createVkLive } from '../src/sources/vk.js';
import { sources } from '../src/index.js';

// Answers VK method calls by name; records every request.
const vkApi = (answers) => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const target = new URL(String(url));
    const method = target.pathname.replace('/method/', '');
    calls.push({ target, method, body: new URLSearchParams(init.body) });
    const answer = answers[method];
    if (answer === undefined) {
      throw new Error(`unexpected VK method ${method}`);
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify(answer),
    };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
};

const vkError = (code, msg) => ({
  error: { error_code: code, error_msg: msg },
});

const gateBody = (description, error = 'invalid_request') =>
  JSON.stringify({ error, error_description: description });

describe('VK OAuth gate classifier (issue #32)', () => {
  it('maps every answer seen in the 2026-10-11 probe', () => {
    const cases = [
      [200, '<!DOCTYPE html><html><form>login</form></html>', 'login-page'],
      [401, gateBody('application is blocked'), 'blocked'],
      [401, gateBody('application is disabled'), 'disabled'],
      [401, gateBody('application was deleted'), 'deleted'],
      [
        401,
        gateBody('incorrect app. Unavailable for apps with direct auth.'),
        'direct-auth-only',
      ],
      [
        401,
        gateBody(
          'Only desktop applications have access to user messages',
          'invalid_scope'
        ),
        'no-messages',
      ],
      [401, gateBody('Security Error'), 'security-error'],
      [401, gateBody('something new'), 'unknown'],
      [500, '<html>oops</html>', 'unknown'],
    ];
    for (const [status, body, outcome] of cases) {
      expect(classifyVkOAuthGate({ status, body })).toBe(outcome);
      expect(Object.keys(VK_OAUTH_GATE_OUTCOMES)).toContain(outcome);
    }
  });

  it('builds the vkhost-style implicit-flow URL on oauth.vk.ru', () => {
    const url = new URL(buildVkAuthorizeUrl({ clientId: 6287487 }));
    expect(url.origin).toBe('https://oauth.vk.ru');
    expect(url.pathname).toBe('/authorize');
    expect(url.searchParams.get('client_id')).toBe('6287487');
    expect(url.searchParams.get('scope')).toBe('messages,offline');
    expect(url.searchParams.get('response_type')).toBe('token');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://oauth.vk.com/blank.html'
    );
    expect(() => buildVkAuthorizeUrl({})).toThrow();
  });

  it('probes without cookies or tokens and does not follow redirects', async () => {
    const seen = [];
    const fetchImpl = async (url, init) => {
      seen.push({ url: new URL(url), init });
      return {
        status: 401,
        text: async () => gateBody('application is blocked'),
      };
    };
    const result = await probeVkOAuthGate({ clientId: 6121396, fetchImpl });
    expect(result).toEqual({
      clientId: 6121396,
      status: 401,
      outcome: 'blocked',
    });
    expect(seen[0].init.redirect).toBe('manual');
    expect(seen[0].url.searchParams.has('access_token')).toBe(false);
    expect(Object.keys(seen[0].init.headers)).toEqual(['Accept-Language']);
  });
});

describe('VK token source catalogue (issue #32)', () => {
  it('covers every vkhost.github.io client and only known values', () => {
    const vkhost = [
      6121396, 5776857, 6463690, 7556576, 7598572, 7571751, 7793118, 6287487,
      7799655, 7539952, 7497650, 5530956, 3698024, 2685278, 4083558,
    ];
    const ids = VK_TOKEN_SOURCES.map((entry) => entry.clientId);
    for (const id of vkhost) {
      expect(ids).toContain(id);
    }
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of VK_TOKEN_SOURCES) {
      expect(['vk', 'third-party']).toContain(entry.publisher);
      expect(Object.keys(VK_OAUTH_GATE_OUTCOMES)).toContain(entry.gate);
      expect(entry.evidence.length > 0).toBe(true);
      if (entry.gate !== 'login-page') {
        expect(entry.recommendation).toBe('unavailable');
      }
    }
  });

  it('marks Kate Mobile unavailable even though its gate is open', () => {
    const kate = VK_TOKEN_SOURCES.find((entry) => entry.clientId === 2685278);
    expect(kate.gate).toBe('login-page');
    expect(kate.recommendation).toBe('unavailable');
  });

  it('ranks first-party VK clients only, best first, by default', () => {
    const ranked = rankVkTokenSources();
    expect(ranked[0].clientId).toBe(6287487);
    expect(ranked.every((entry) => entry.publisher === 'vk')).toBe(true);
    expect(ranked.some((entry) => entry.recommendation === 'unavailable')).toBe(
      false
    );
  });

  it('puts third-party clients after every first-party one when asked', () => {
    const ranked = rankVkTokenSources({ includeThirdParty: true });
    const firstThird = ranked.findIndex(
      (entry) => entry.publisher === 'third-party'
    );
    expect(firstThird > 0).toBe(true);
    expect(
      ranked.slice(firstThird).every((entry) => entry.publisher !== 'vk')
    ).toBe(true);
    expect(ranked.map((entry) => entry.clientId)).not.toContain(2685278);
  });

  it('is re-exported from the sources barrel', () => {
    expect(sources.VK_TOKEN_SOURCES).toBe(VK_TOKEN_SOURCES);
    expect(typeof sources.inspectVkToken).toBe('function');
  });
});

describe('VK token inspection (issue #32)', () => {
  it('decodes the account.getAppPermissions bitmask', () => {
    // messages = 4096, offline = 65536.
    expect(decodeVkUserScope(4096 + 65536)).toEqual(['messages', 'offline']);
    // vkhost's default scope=1073737727 is every right except messages:
    // its script leaves that box unticked ("доступ к API сообщений ограничен").
    const vkhostDefault = decodeVkUserScope(1073737727);
    expect(vkhostDefault).not.toContain('messages');
    expect(vkhostDefault).toContain('offline');
    expect(vkhostDefault.length).toBe(
      Object.keys(VK_USER_SCOPE_BITS).length - 1
    );
    expect(decodeVkUserScope(-1)).toEqual([]);
    expect(decodeVkUserScope('nope')).toEqual([]);
  });

  it('explains the VK error codes users hit after the Kate ban', () => {
    expect(describeVkError(9)).toMatch(/Flood control/);
    expect(
      describeVkError(new Error('vk API 5: User authorization failed'))
    ).toMatch(/invalid, expired or revoked/);
    expect(describeVkError(12345)).toBe(null);
  });

  it('reports a user token that can still read messages', async () => {
    const fetchImpl = vkApi({
      'users.get': {
        response: [{ id: 1, first_name: 'Pavel', last_name: 'D' }],
      },
      'account.getAppPermissions': { response: 4096 + 65536 + 2 },
      'messages.getConversations': { response: { count: 3, items: [] } },
    });
    const report = await inspectVkToken({
      token: 't',
      fetchImpl,
      baseUrl: 'https://vk.test',
    });
    expect(report.verdict).toBe('messages');
    expect(report.user).toEqual({ id: 1, name: 'Pavel D' });
    expect(report.offline).toBe(true);
    expect(report.scopes).toContain('messages');
    expect(fetchImpl.calls.map((call) => call.method)).toEqual([
      'users.get',
      'account.getAppPermissions',
      'messages.getConversations',
    ]);
    expect(fetchImpl.calls[2].body.get('count')).toBe('1');
    expect(
      fetchImpl.calls.every((call) => call.body.get('access_token') === 't')
    ).toBe(true);
  });

  it('reports a borrowed client that VK cut off with flood control', async () => {
    const report = await inspectVkToken({
      token: 'kate',
      baseUrl: 'https://vk.test',
      fetchImpl: vkApi({
        'users.get': { response: [{ id: 2, first_name: 'Kate' }] },
        'account.getAppPermissions': { response: 4096 },
        'messages.getConversations': vkError(9, 'Flood control'),
      }),
    });
    expect(report.verdict).toBe('no-messages');
    expect(report.offline).toBe(false);
    expect(report.messages.code).toBe(9);
    expect(report.messages.hint).toMatch(/permanent cut-off/);
  });

  it('reports an invalid token without further calls', async () => {
    const fetchImpl = vkApi({
      'users.get': vkError(5, 'User authorization failed'),
    });
    const report = await inspectVkToken({
      token: 'bad',
      fetchImpl,
      baseUrl: 'https://vk.test',
    });
    expect(report.verdict).toBe('invalid');
    expect(report.messages.code).toBe(5);
    expect(fetchImpl.calls.length).toBe(1);
  });

  it('recognises a community token', async () => {
    const empty = await inspectVkToken({
      token: 'group',
      baseUrl: 'https://vk.test',
      fetchImpl: vkApi({ 'users.get': { response: [] } }),
    });
    expect(empty.verdict).toBe('community');
    const refused = await inspectVkToken({
      token: 'group',
      baseUrl: 'https://vk.test',
      fetchImpl: vkApi({
        'users.get': vkError(27, 'Group authorization failed'),
      }),
    });
    expect(refused.verdict).toBe('community');
  });
});

describe('VK live adapter defaults (issue #32)', () => {
  it('talks to api.vk.ru by default and tags errors with the VK code', async () => {
    const fetchImpl = vkApi({ 'users.get': vkError(29, 'Rate limit reached') });
    const live = createVkLive({ token: 't', fetchImpl });
    let caught = null;
    try {
      await live.call('users.get');
    } catch (error) {
      caught = error;
    }
    expect(fetchImpl.calls[0].target.origin).toBe('https://api.vk.ru');
    expect(caught.message).toBe('vk API 29: Rate limit reached');
    expect(caught.vkCode).toBe(29);
  });
});
