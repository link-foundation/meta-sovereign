// Issue #4 / R-S20: reproducing tests for the Upwork source adapter.
//
// Covers archive import (envelope + array + CSV), live `searchJobs`,
// `pullMessages` for both `client` and `freelancer` perspectives,
// `post()` mutation, source-registry integration, and the
// `softCacheRetention()` purge.

import { describe, it, expect } from 'test-anywhere';

import {
  upworkSource,
  createUpworkLive,
  upworkPayloadsToLinks,
  softCacheRetention,
} from '../src/sources/upwork.js';
import { listSources, getSource, importInto } from '../src/sources/index.js';
import { createMemoryStore } from '../src/storage/index.js';

const json = (body, init = {}) => ({
  ok: (init.status ?? 200) < 400,
  status: init.status ?? 200,
  statusText: init.statusText ?? 'OK',
  headers: new Map([
    ['Content-Type', 'application/json'],
    ...Object.entries(init.headers ?? {}),
  ]),
  async text() {
    return JSON.stringify(body);
  },
});

const mockFetch = (...handlers) => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    const call = { url: new URL(String(url)), init, body };
    calls.push(call);
    const handler = handlers.shift();
    if (!handler) {
      throw new Error(`unexpected fetch ${call.url.pathname}`);
    }
    return json(await handler(call));
  };
  fetchImpl.calls = calls;
  return fetchImpl;
};

describe('upwork archive import', () => {
  it('parses an envelope of jobs, contracts, rooms, messages, and transactions', async () => {
    const envelope = {
      jobs: [
        {
          id: 'j1',
          title: 'React engineer',
          description: 'short term',
          budget: { amount: 5000 },
          publishedAt: '2026-04-01T00:00:00Z',
          client: { id: 'c1' },
        },
      ],
      contracts: [
        {
          id: 'k1',
          jobId: 'j1',
          startDate: '2026-04-15T00:00:00Z',
          status: 'active',
          client: { id: 'c1' },
          freelancer: { id: 'f1' },
          roomId: 'r1',
        },
      ],
      rooms: [
        {
          id: 'r1',
          contractId: 'k1',
          jobId: 'j1',
          topic: 'work room',
        },
      ],
      messages: [
        {
          id: 'm1',
          text: 'hi',
          author: { id: 'c1' },
          roomId: 'r1',
          createdAt: '2026-04-15T01:00:00Z',
        },
        {
          id: 'm2',
          text: 'hello back',
          author: { id: 'f1' },
          roomId: 'r1',
          createdAt: '2026-04-15T02:00:00Z',
        },
      ],
      transactions: [
        {
          id: 't1',
          type: 'Hourly',
          description: 'week 1',
          amount: '100',
          balance: '100',
          freelancer: 'Alice',
          date: '2026-04-22',
        },
      ],
    };
    const links = await upworkSource.parseArchive(envelope);
    expect(links.length).toBe(6);
    const ids = links.map((l) => l.id);
    expect(ids.includes('job:upwork:j1')).toBe(true);
    expect(ids.includes('contract:upwork:k1')).toBe(true);
    expect(ids.includes('room:upwork:r1')).toBe(true);
    expect(ids.includes('msg:upwork:m1')).toBe(true);
    expect(ids.includes('msg:upwork:m2')).toBe(true);
    expect(ids.includes('transaction:upwork:t1')).toBe(true);
  });

  it('classifies a flat array of mixed payloads', () => {
    const links = upworkPayloadsToLinks([
      {
        id: 'j2',
        title: 'Backend engineer',
        description: 'long term',
        client: { id: 'c2' },
        publishedAt: '2026-03-01T00:00:00Z',
      },
      {
        id: 'm3',
        text: 'inline',
        author: { id: 'f2' },
        roomId: 'r2',
      },
    ]);
    expect(links.length).toBe(2);
    expect(links[0].id).toBe('job:upwork:j2');
    expect(links[1].id).toBe('msg:upwork:m3');
  });

  it('parses a CSV transaction-history string', async () => {
    const csv = [
      'Date,Type,Description,Amount,Balance,Freelancer,Team,Account name,PO,Ref ID',
      '"2026-04-22","Hourly","Week 1, ref 12345","100.00","100.00","Alice","-","Personal","-","T-1"',
      '"2026-04-29","Hourly","Week 2","200.00","300.00","Alice","-","Personal","-","T-2"',
    ].join('\n');
    const links = await upworkSource.parseArchive(csv);
    expect(links.length).toBe(2);
    expect(links[0].id).toBe('transaction:upwork:T-1');
    expect(links[0].description).toBe('Week 1, ref 12345');
    expect(links[1].id).toBe('transaction:upwork:T-2');
  });

  it('importInto writes upwork links into a memory store', async () => {
    const store = createMemoryStore();
    const n = await importInto(store, 'upwork', {
      messages: [
        {
          id: 'mz',
          text: 'hi store',
          author: { id: 'a' },
          roomId: 'rZ',
          createdAt: '2026-04-15T03:00:00Z',
        },
      ],
    });
    expect(n).toBe(1);
    const all = await store.query();
    expect(all[0].id).toBe('msg:upwork:mz');
    expect(all[0].source).toBe('upwork');
  });
});

describe('upwork live searchJobs', () => {
  it('runs the marketplaceJobPostingsSearch operation and stamps a 24h soft cache', async () => {
    const fetchImpl = mockFetch(() => ({
      data: {
        marketplaceJobPostingsSearch: {
          edges: [
            {
              node: {
                id: 'jX',
                title: 'React contractor',
                description: 'short',
                createdDateTime: '2026-04-01T00:00:00Z',
                client: { id: 'cX' },
              },
              cursor: 'c1',
            },
          ],
          pageInfo: { endCursor: 'c1', hasNextPage: false },
        },
      },
    }));

    const live = createUpworkLive({ token: 'pat', fetchImpl });
    const result = await live.searchJobs({ query: 'react', limit: 5 });

    expect(result.links.length).toBe(1);
    expect(result.links[0].id).toBe('job:upwork:jX');
    expect(result.links[0].softCache).toBe(true);
    expect(result.links[0].cacheTtlMs).toBe(24 * 60 * 60 * 1000);

    expect(fetchImpl.calls.length).toBe(1);
    const call = fetchImpl.calls[0];
    expect(call.url.toString()).toBe('https://api.upwork.com/graphql');
    expect(call.init.headers.Authorization).toBe('Bearer pat');
    expect(call.body.query.includes('marketplaceJobPostingsSearch')).toBe(true);
    expect(call.body.variables.first).toBe(5);
  });
});

describe('upwork live pullMessages', () => {
  it('walks contracts -> rooms -> messages from the freelancer perspective', async () => {
    const fetchImpl = mockFetch(
      // listContracts
      () => ({
        data: {
          contracts: {
            edges: [
              {
                node: {
                  id: 'k1',
                  jobId: 'j1',
                  status: 'active',
                  type: 'HOURLY',
                  startDate: '2026-04-15T00:00:00Z',
                  client: { id: 'c1' },
                  freelancer: { id: 'f1' },
                  roomId: 'r1',
                },
              },
            ],
            pageInfo: { endCursor: null, hasNextPage: false },
          },
        },
      }),
      // roomMessages for r1
      () => ({
        data: {
          roomsRoomMessages: {
            edges: [
              {
                node: {
                  id: 'mA',
                  text: 'hello',
                  createdAt: '2026-04-15T05:00:00Z',
                  author: { id: 'f1' },
                },
              },
            ],
            pageInfo: { endCursor: null, hasNextPage: false },
          },
        },
      })
    );

    const live = createUpworkLive({ token: 'pat', fetchImpl });
    const result = await live.pullMessages({
      stage: 'contract',
      perspective: 'freelancer',
    });

    const ids = result.links.map((l) => l.id);
    expect(ids.includes('msg:upwork:mA')).toBe(true);
    expect(ids.includes('room:upwork:r1')).toBe(true);
    expect(ids.includes('contract:upwork:k1')).toBe(true);
    // Every link is soft-cached.
    expect(result.links.every((l) => l.softCache === true)).toBe(true);
    // listContracts perspective is FREELANCER.
    expect(fetchImpl.calls[0].body.variables.perspective).toBe('FREELANCER');
  });

  it('runs the same code path with perspective=client', async () => {
    const fetchImpl = mockFetch(
      () => ({
        data: {
          contracts: {
            edges: [
              {
                node: {
                  id: 'k2',
                  jobId: 'j2',
                  status: 'active',
                  type: 'FIXED',
                  client: { id: 'c2' },
                  freelancer: { id: 'f2' },
                  roomId: 'r2',
                },
              },
            ],
            pageInfo: { endCursor: null, hasNextPage: false },
          },
        },
      }),
      () => ({
        data: {
          roomsRoomMessages: {
            edges: [
              {
                node: {
                  id: 'mB',
                  text: 'kickoff',
                  createdAt: '2026-04-16T00:00:00Z',
                  author: { id: 'c2' },
                },
              },
            ],
            pageInfo: { endCursor: null, hasNextPage: false },
          },
        },
      })
    );

    const live = createUpworkLive({ token: 'pat', fetchImpl });
    const result = await live.pullMessages({
      stage: 'contract',
      perspective: 'client',
    });

    expect(result.links.some((l) => l.id === 'msg:upwork:mB')).toBe(true);
    expect(fetchImpl.calls[0].body.variables.perspective).toBe('CLIENT');
  });
});

describe('upwork live post', () => {
  it('issues the roomsCreateMessage mutation', async () => {
    const fetchImpl = mockFetch(() => ({
      data: {
        roomsCreateMessage: {
          message: {
            id: 'mPosted',
            text: 'replied',
            createdAt: '2026-05-06T00:00:00Z',
            author: { id: 'me' },
          },
        },
      },
    }));

    const live = createUpworkLive({ token: 'pat', fetchImpl });
    const link = await live.post({ text: 'replied' }, { roomId: 'r9' });

    expect(link.id).toBe('msg:upwork:mPosted');
    expect(link.softCache).toBe(true);
    const call = fetchImpl.calls[0];
    expect(call.body.query.includes('roomsCreateMessage')).toBe(true);
    expect(call.body.variables.roomId).toBe('r9');
    expect(call.body.variables.text).toBe('replied');
  });

  it('throws when text is missing', async () => {
    const live = createUpworkLive({
      token: 'pat',
      fetchImpl: async () => ({}),
    });
    let caught = null;
    try {
      await live.post({}, { roomId: 'r9' });
    } catch (err) {
      caught = err;
    }
    expect(caught instanceof Error).toBe(true);
  });
});

describe('upwork source registry integration', () => {
  it('includes upwork in listSources()', () => {
    expect(listSources().includes('upwork')).toBe(true);
    expect(getSource('upwork').name).toBe('upwork');
  });
});

describe('upwork softCacheRetention', () => {
  it('purges expired live links and leaves archive links alone', async () => {
    const store = createMemoryStore();
    const ttlMs = 60_000;
    const old = Date.now() - 2 * ttlMs;
    const fresh = Date.now() - 1000;
    await store.put({
      id: 'msg:upwork:expired',
      tokens: ['message', 'upwork', 'expired'],
      source: 'upwork',
      softCache: true,
      cachedAt: old,
      cacheTtlMs: ttlMs,
    });
    await store.put({
      id: 'msg:upwork:fresh',
      tokens: ['message', 'upwork', 'fresh'],
      source: 'upwork',
      softCache: true,
      cachedAt: fresh,
      cacheTtlMs: ttlMs,
    });
    await store.put({
      id: 'msg:upwork:archive',
      tokens: ['message', 'upwork', 'archive'],
      source: 'upwork',
    });
    await store.put({
      id: 'msg:github:other',
      tokens: ['message', 'github', 'other'],
      source: 'github',
      softCache: true,
      cachedAt: old,
      cacheTtlMs: ttlMs,
    });

    const result = await softCacheRetention(store, { ttlMs });
    expect(result.purged).toBe(1);

    const surviving = (await store.query()).map((l) => l.id).sort();
    expect(surviving).toEqual([
      'msg:github:other',
      'msg:upwork:archive',
      'msg:upwork:fresh',
    ]);
  });
});
