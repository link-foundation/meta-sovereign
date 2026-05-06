// Issue #12 / R-T20: reproducing tests for the PeoplePerHour source
// adapter.
//
// Covers archive import (envelope + array + CSV), live
// `searchProjects`, `pullMessages` for both `buyer` and `freelancer`
// perspectives, `post()` mutation, source-registry integration, and
// the `softCacheRetention()` purge.

import { describe, it, expect } from 'test-anywhere';

import {
  peoplePerHourSource,
  createPeoplePerHourLive,
  peoplePerHourPayloadsToLinks,
  softCacheRetention,
} from '../src/sources/peopleperhour.js';
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

describe('peopleperhour archive import', () => {
  it('parses an envelope of projects, workstreams, rooms, messages, invoices, and hourstreams', async () => {
    const envelope = {
      projects: [
        {
          id: 'p1',
          title: 'React contractor',
          description: 'short term',
          budget: { amount: 5000 },
          publishedAt: '2026-04-01T00:00:00Z',
          buyer: { id: 'b1' },
        },
      ],
      proposals: [
        {
          id: 'pr1',
          projectId: 'p1',
          freelancer: { id: 'f1' },
          buyer: { id: 'b1' },
          status: 'submitted',
          coverLetter: 'I am perfect for this',
          bidAmount: 4500,
        },
      ],
      workstreams: [
        {
          id: 'w1',
          projectId: 'p1',
          startDate: '2026-04-15T00:00:00Z',
          status: 'active',
          buyer: { id: 'b1' },
          freelancer: { id: 'f1' },
          roomId: 'r1',
        },
      ],
      rooms: [
        {
          id: 'r1',
          workstreamId: 'w1',
          projectId: 'p1',
          topic: 'work room',
        },
      ],
      messages: [
        {
          id: 'm1',
          text: 'hi',
          author: { id: 'b1' },
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
      invoices: [
        {
          id: 'inv1',
          type: 'Hourly',
          description: 'week 1',
          net: '100',
          gross: '110',
          buyer: 'Bob',
          freelancer: 'Alice',
          reference: 'I-001',
          date: '2026-04-22',
        },
      ],
      hourstreams: [
        {
          workstreamId: 'w1',
          weekStart: '2026-04-22',
          hours: 10,
          earnings: 250,
        },
      ],
    };
    const links = await peoplePerHourSource.parseArchive(envelope);
    expect(links.length).toBe(8);
    const ids = links.map((l) => l.id);
    expect(ids.includes('project:peopleperhour:p1')).toBe(true);
    expect(ids.includes('proposal:peopleperhour:pr1')).toBe(true);
    expect(ids.includes('workstream:peopleperhour:w1')).toBe(true);
    expect(ids.includes('room:peopleperhour:r1')).toBe(true);
    expect(ids.includes('msg:peopleperhour:m1')).toBe(true);
    expect(ids.includes('msg:peopleperhour:m2')).toBe(true);
    expect(ids.includes('invoice:peopleperhour:inv1')).toBe(true);
    expect(ids.includes('hourstream:peopleperhour:w1:2026-04-22')).toBe(true);
  });

  it('classifies a flat array of mixed payloads', () => {
    const links = peoplePerHourPayloadsToLinks([
      {
        id: 'p2',
        title: 'Backend engineer',
        description: 'long term',
        buyer: { id: 'b2' },
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
    expect(links[0].id).toBe('project:peopleperhour:p2');
    expect(links[1].id).toBe('msg:peopleperhour:m3');
  });

  it('parses a CSV earnings string', async () => {
    const csv = [
      'Date,Type,Description,Net,Gross,Buyer,Freelancer,Reference',
      '"2026-04-22","Hourly","Week 1, ref 12345","100.00","110.00","Bob","Alice","I-001"',
      '"2026-04-29","Hourly","Week 2","200.00","220.00","Bob","Alice","I-002"',
    ].join('\n');
    const links = await peoplePerHourSource.parseArchive(csv);
    expect(links.length).toBe(2);
    expect(links[0].id).toBe('invoice:peopleperhour:I-001');
    expect(links[0].description).toBe('Week 1, ref 12345');
    expect(links[1].id).toBe('invoice:peopleperhour:I-002');
  });

  it('importInto writes peopleperhour links into a memory store', async () => {
    const store = createMemoryStore();
    const n = await importInto(store, 'peopleperhour', {
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
    expect(all[0].id).toBe('msg:peopleperhour:mz');
    expect(all[0].source).toBe('peopleperhour');
  });
});

describe('peopleperhour live searchProjects', () => {
  it('runs GET /projects/search and stamps a 24h soft cache', async () => {
    const fetchImpl = mockFetch(() => ({
      items: [
        {
          id: 'pX',
          title: 'React contractor',
          description: 'short',
          publishedAt: '2026-04-01T00:00:00Z',
          buyer: { id: 'bX' },
        },
      ],
      nextCursor: null,
    }));

    const live = createPeoplePerHourLive({ token: 'pat', fetchImpl });
    const result = await live.searchProjects({ query: 'react', limit: 5 });

    expect(result.links.length).toBe(1);
    expect(result.links[0].id).toBe('project:peopleperhour:pX');
    expect(result.links[0].softCache).toBe(true);
    expect(result.links[0].cacheTtlMs).toBe(24 * 60 * 60 * 1000);

    expect(fetchImpl.calls.length).toBe(1);
    const call = fetchImpl.calls[0];
    expect(call.url.pathname).toBe('/api/v1/projects/search');
    expect(call.url.searchParams.get('query')).toBe('react');
    expect(call.url.searchParams.get('limit')).toBe('5');
    expect(call.init.headers.Authorization).toBe('Bearer pat');
  });
});

describe('peopleperhour live pullMessages', () => {
  it('walks workstreams -> messages from the freelancer perspective', async () => {
    const fetchImpl = mockFetch(
      // listWorkstreams
      () => ({
        items: [
          {
            id: 'w1',
            projectId: 'p1',
            status: 'active',
            startDate: '2026-04-15T00:00:00Z',
            buyer: { id: 'b1' },
            freelancer: { id: 'f1' },
            roomId: 'r1',
          },
        ],
        nextCursor: null,
      }),
      // workstream messages for w1
      () => ({
        items: [
          {
            id: 'mA',
            text: 'hello',
            createdAt: '2026-04-15T05:00:00Z',
            author: { id: 'f1' },
          },
        ],
        nextCursor: null,
      }),
      // listMyProposals
      () => ({ items: [], nextCursor: null })
    );

    const live = createPeoplePerHourLive({ token: 'pat', fetchImpl });
    const result = await live.pullMessages({
      stage: 'all',
      perspective: 'freelancer',
    });

    const ids = result.links.map((l) => l.id);
    expect(ids.includes('msg:peopleperhour:mA')).toBe(true);
    expect(ids.includes('workstream:peopleperhour:w1')).toBe(true);
    // Every link is soft-cached.
    expect(result.links.every((l) => l.softCache === true)).toBe(true);
    expect(fetchImpl.calls[0].url.pathname).toBe('/api/v1/workstreams');
    expect(fetchImpl.calls[0].url.searchParams.get('perspective')).toBe(
      'freelancer'
    );
    expect(fetchImpl.calls[1].url.pathname).toBe(
      '/api/v1/workstreams/w1/messages'
    );
  });

  it('runs the same code path with perspective=buyer', async () => {
    const fetchImpl = mockFetch(
      () => ({
        items: [
          {
            id: 'w2',
            projectId: 'p2',
            status: 'active',
            buyer: { id: 'b2' },
            freelancer: { id: 'f2' },
            roomId: 'r2',
          },
        ],
        nextCursor: null,
      }),
      () => ({
        items: [
          {
            id: 'mB',
            text: 'kickoff',
            createdAt: '2026-04-16T00:00:00Z',
            author: { id: 'b2' },
          },
        ],
        nextCursor: null,
      })
    );

    const live = createPeoplePerHourLive({ token: 'pat', fetchImpl });
    const result = await live.pullMessages({
      stage: 'workstream',
      perspective: 'buyer',
    });

    expect(result.links.some((l) => l.id === 'msg:peopleperhour:mB')).toBe(
      true
    );
    expect(fetchImpl.calls[0].url.searchParams.get('perspective')).toBe(
      'buyer'
    );
  });

  it('walks proposal-room messages when a projectId is passed', async () => {
    const fetchImpl = mockFetch(
      // projectProposals
      () => ({
        items: [
          {
            id: 'pr9',
            projectId: 'pZ',
            freelancer: { id: 'fZ' },
            buyer: { id: 'bZ' },
            status: 'submitted',
            coverLetter: 'pick me',
          },
        ],
        nextCursor: null,
      }),
      // proposal messages for pr9
      () => ({
        items: [
          {
            id: 'mC',
            text: 'before approval',
            createdAt: '2026-04-10T00:00:00Z',
            author: { id: 'fZ' },
          },
        ],
        nextCursor: null,
      })
    );

    const live = createPeoplePerHourLive({ token: 'pat', fetchImpl });
    const result = await live.pullMessages({
      stage: 'proposal',
      projectId: 'pZ',
    });

    const ids = result.links.map((l) => l.id);
    expect(ids.includes('msg:peopleperhour:mC')).toBe(true);
    expect(ids.includes('proposal:peopleperhour:pr9')).toBe(true);
    expect(fetchImpl.calls[0].url.pathname).toBe(
      '/api/v1/projects/pZ/proposals'
    );
    expect(fetchImpl.calls[1].url.pathname).toBe(
      '/api/v1/proposals/pr9/messages'
    );
  });
});

describe('peopleperhour live post', () => {
  it('issues POST /workstreams/{id}/messages by default', async () => {
    const fetchImpl = mockFetch(() => ({
      message: {
        id: 'mPosted',
        text: 'replied',
        createdAt: '2026-05-06T00:00:00Z',
        author: { id: 'me' },
      },
    }));

    const live = createPeoplePerHourLive({ token: 'pat', fetchImpl });
    const link = await live.post({ text: 'replied' }, { workstreamId: 'w9' });

    expect(link.id).toBe('msg:peopleperhour:mPosted');
    expect(link.softCache).toBe(true);
    const call = fetchImpl.calls[0];
    expect(call.url.pathname).toBe('/api/v1/workstreams/w9/messages');
    expect(call.init.method).toBe('POST');
    expect(call.body.text).toBe('replied');
  });

  it('routes to POST /proposals/{id}/messages when proposalId is given', async () => {
    const fetchImpl = mockFetch(() => ({
      message: {
        id: 'mProp',
        text: 'pre-hire reply',
        createdAt: '2026-05-06T00:00:00Z',
        author: { id: 'me' },
      },
    }));

    const live = createPeoplePerHourLive({ token: 'pat', fetchImpl });
    const link = await live.post(
      { text: 'pre-hire reply' },
      { proposalId: 'pr9' }
    );

    expect(link.id).toBe('msg:peopleperhour:mProp');
    expect(fetchImpl.calls[0].url.pathname).toBe(
      '/api/v1/proposals/pr9/messages'
    );
  });

  it('throws when text is missing', async () => {
    const live = createPeoplePerHourLive({
      token: 'pat',
      fetchImpl: async () => ({}),
    });
    let caught = null;
    try {
      await live.post({}, { workstreamId: 'w9' });
    } catch (err) {
      caught = err;
    }
    expect(caught instanceof Error).toBe(true);
  });

  it('throws when neither workstreamId nor proposalId is supplied', async () => {
    const live = createPeoplePerHourLive({
      token: 'pat',
      fetchImpl: async () => ({}),
    });
    let caught = null;
    try {
      await live.post({ text: 'hi' }, {});
    } catch (err) {
      caught = err;
    }
    expect(caught instanceof Error).toBe(true);
  });
});

describe('peopleperhour source registry integration', () => {
  it('includes peopleperhour in listSources()', () => {
    expect(listSources().includes('peopleperhour')).toBe(true);
    expect(getSource('peopleperhour').name).toBe('peopleperhour');
  });
});

describe('peopleperhour softCacheRetention', () => {
  it('purges expired live links and leaves archive links alone', async () => {
    const store = createMemoryStore();
    const ttlMs = 60_000;
    const old = Date.now() - 2 * ttlMs;
    const fresh = Date.now() - 1000;
    await store.put({
      id: 'msg:peopleperhour:expired',
      tokens: ['message', 'peopleperhour', 'expired'],
      source: 'peopleperhour',
      softCache: true,
      cachedAt: old,
      cacheTtlMs: ttlMs,
    });
    await store.put({
      id: 'msg:peopleperhour:fresh',
      tokens: ['message', 'peopleperhour', 'fresh'],
      source: 'peopleperhour',
      softCache: true,
      cachedAt: fresh,
      cacheTtlMs: ttlMs,
    });
    await store.put({
      id: 'msg:peopleperhour:archive',
      tokens: ['message', 'peopleperhour', 'archive'],
      source: 'peopleperhour',
    });
    await store.put({
      id: 'msg:upwork:other',
      tokens: ['message', 'upwork', 'other'],
      source: 'upwork',
      softCache: true,
      cachedAt: old,
      cacheTtlMs: ttlMs,
    });

    const result = await softCacheRetention(store, { ttlMs });
    expect(result.purged).toBe(1);

    const surviving = (await store.query()).map((l) => l.id).sort();
    expect(surviving).toEqual([
      'msg:peopleperhour:archive',
      'msg:peopleperhour:fresh',
      'msg:upwork:other',
    ]);
  });
});
