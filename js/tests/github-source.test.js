// Issue #5 / R-R16: reproducing tests for the GitHub source adapter.
//
// Covers archive import (envelope and array), live `pullMessages` with
// stubbed `fetchImpl`, paginated `listRepos` via Link: rel="next",
// `cloneRepo` indexing of an in-memory tarball, `post()` comment
// creation, and source-registry integration.

import { describe, it, expect } from 'test-anywhere';
import zlib from 'node:zlib';

import {
  githubSource,
  createGithubLive,
  githubPayloadsToLinks,
  paginate,
  readTarEntries,
} from '../src/sources/github.js';
import {
  listSources,
  getSource,
  importInto,
  pullLiveInto,
} from '../src/sources/index.js';
import { createMemoryStore } from '../src/storage/index.js';

const headersFromEntries = (entries = {}) => {
  const map = new Map(
    Object.entries({ 'Content-Type': 'application/json', ...entries })
  );
  return {
    get(name) {
      return map.get(name) ?? map.get(name.toLowerCase()) ?? null;
    },
  };
};

const jsonResponse = (body, init = {}) => ({
  ok: (init.status ?? 200) < 400,
  status: init.status ?? 200,
  statusText: init.statusText ?? 'OK',
  headers: headersFromEntries(init.headers),
  async text() {
    return typeof body === 'string' ? body : JSON.stringify(body);
  },
  async json() {
    return body;
  },
});

const binaryResponse = (bytes, init = {}) => ({
  ok: (init.status ?? 200) < 400,
  status: init.status ?? 200,
  statusText: init.statusText ?? 'OK',
  headers: headersFromEntries(init.headers),
  async arrayBuffer() {
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    );
  },
  async text() {
    return '';
  },
});

const queueFetch = (handlers) => {
  const calls = [];
  const remaining = [...handlers];
  const fetchImpl = async (url, init = {}) => {
    const target = new URL(String(url));
    const handler = remaining.shift();
    if (!handler) {
      throw new Error(`unexpected fetch ${target.pathname}`);
    }
    const call = { url: target, init };
    calls.push(call);
    return handler(call);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
};

describe('github archive import', () => {
  it('parses an envelope of issues, comments, pulls, review comments, reviews, and discussions', async () => {
    const envelope = {
      issues: [
        {
          id: 1,
          number: 5,
          title: 'Add GitHub support',
          body: 'please',
          user: { login: 'konard' },
          repository: { full_name: 'link-foundation/meta-sovereign' },
          created_at: '2026-05-04T10:00:00Z',
        },
      ],
      comments: [
        {
          id: 100,
          body: 'sounds good',
          user: { login: 'alice' },
          issue_url:
            'https://api.github.com/repos/link-foundation/meta-sovereign/issues/5',
          created_at: '2026-05-04T11:00:00Z',
        },
      ],
      pulls: [
        {
          id: 200,
          number: 22,
          title: 'PR title',
          body: 'PR body',
          user: { login: 'konard' },
          base: { repo: { full_name: 'link-foundation/meta-sovereign' } },
          created_at: '2026-05-04T12:00:00Z',
        },
      ],
      reviewComments: [
        {
          id: 300,
          body: 'inline nit',
          user: { login: 'bob' },
          pull_request_url:
            'https://api.github.com/repos/link-foundation/meta-sovereign/pulls/22',
          diff_hunk: '@@',
          created_at: '2026-05-04T13:00:00Z',
        },
      ],
      reviews: [
        {
          id: 400,
          state: 'APPROVED',
          body: 'lgtm',
          user: { login: 'bob' },
          pull_request_url:
            'https://api.github.com/repos/link-foundation/meta-sovereign/pulls/22',
          submitted_at: '2026-05-04T14:00:00Z',
        },
      ],
      discussions: [
        {
          id: 500,
          number: 3,
          title: 'planning',
          body: 'lets chat',
          user: { login: 'konard' },
          repository: { full_name: 'link-foundation/meta-sovereign' },
          created_at: '2026-05-04T15:00:00Z',
        },
      ],
    };
    const links = await githubSource.parseArchive(envelope);
    expect(links.length).toBe(6);
    const ids = links.map((l) => l.id);
    expect(
      ids.includes('msg:github:issue:link-foundation/meta-sovereign#5')
    ).toBe(true);
    expect(
      ids.includes(
        'msg:github:issue-comment:link-foundation/meta-sovereign#100'
      )
    ).toBe(true);
    expect(
      ids.includes('msg:github:pr:link-foundation/meta-sovereign#22')
    ).toBe(true);
    expect(
      ids.includes(
        'msg:github:review-comment:link-foundation/meta-sovereign#300'
      )
    ).toBe(true);
    expect(
      ids.includes('msg:github:review:link-foundation/meta-sovereign#22:400')
    ).toBe(true);
    expect(
      ids.includes('msg:github:discussion:link-foundation/meta-sovereign#3')
    ).toBe(true);
  });

  it('classifies a flat array of mixed gh api dumps', () => {
    const links = githubPayloadsToLinks([
      {
        id: 1,
        number: 5,
        title: 't',
        user: { login: 'a' },
        repository: { full_name: 'o/r' },
      },
      {
        id: 2,
        body: 'c',
        user: { login: 'b' },
        issue_url: 'https://api.github.com/repos/o/r/issues/5',
      },
    ]);
    expect(links.length).toBe(2);
    expect(links[0].id).toBe('msg:github:issue:o/r#5');
    expect(links[1].id).toBe('msg:github:issue-comment:o/r#2');
  });

  it('importInto registers github links with the right shape', async () => {
    const store = createMemoryStore();
    const n = await importInto(store, 'github', {
      issues: [
        {
          id: 1,
          number: 1,
          title: 'hi',
          user: { login: 'u' },
          repository: { full_name: 'o/r' },
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    });
    expect(n).toBe(1);
    const all = await store.query();
    expect(all[0].id).toBe('msg:github:issue:o/r#1');
    expect(all[0].source).toBe('github');
  });
});

describe('github live pullMessages', () => {
  it('walks issues, comments, pulls, review comments, and per-PR reviews', async () => {
    const fetchImpl = queueFetch([
      // /repos/o/r/issues
      () =>
        jsonResponse([
          {
            id: 11,
            number: 1,
            title: 'first',
            body: 'b',
            user: { login: 'a' },
            url: 'https://api.github.com/repos/o/r/issues/1',
            created_at: '2026-01-01T00:00:00Z',
          },
        ]),
      // /repos/o/r/issues/comments
      () =>
        jsonResponse([
          {
            id: 12,
            body: 'cmt',
            user: { login: 'b' },
            issue_url: 'https://api.github.com/repos/o/r/issues/1',
            created_at: '2026-01-02T00:00:00Z',
          },
        ]),
      // /repos/o/r/pulls
      () =>
        jsonResponse([
          {
            id: 21,
            number: 9,
            title: 'pr',
            body: 'pb',
            user: { login: 'a' },
            base: { repo: { full_name: 'o/r' } },
            url: 'https://api.github.com/repos/o/r/pulls/9',
            created_at: '2026-01-03T00:00:00Z',
          },
        ]),
      // /repos/o/r/pulls/comments
      () =>
        jsonResponse([
          {
            id: 22,
            body: 'inline',
            user: { login: 'b' },
            pull_request_url: 'https://api.github.com/repos/o/r/pulls/9',
            diff_hunk: '@@',
            created_at: '2026-01-03T01:00:00Z',
          },
        ]),
      // /repos/o/r/pulls/9/reviews
      () =>
        jsonResponse([
          {
            id: 23,
            state: 'APPROVED',
            body: 'lgtm',
            user: { login: 'b' },
            submitted_at: '2026-01-03T02:00:00Z',
          },
        ]),
    ]);

    const live = createGithubLive({
      token: 'pat',
      owner: 'o',
      repo: 'r',
      fetchImpl,
    });
    const result = await live.pullMessages();
    expect(result.links.length).toBe(5);
    expect(result.rawCount).toBe(5);
    const calls = fetchImpl.calls.map((c) => c.url.pathname);
    expect(calls).toEqual([
      '/repos/o/r/issues',
      '/repos/o/r/issues/comments',
      '/repos/o/r/pulls',
      '/repos/o/r/pulls/comments',
      '/repos/o/r/pulls/9/reviews',
    ]);
    // Authorization header is forwarded.
    expect(fetchImpl.calls[0].init.headers.Authorization).toBe('Bearer pat');
  });

  it('skips pull-request entries when /issues echoes them', async () => {
    const fetchImpl = queueFetch([
      () =>
        jsonResponse([
          {
            id: 1,
            number: 5,
            title: 'real issue',
            user: { login: 'a' },
            url: 'https://api.github.com/repos/o/r/issues/5',
          },
          {
            id: 2,
            number: 6,
            title: 'pr-as-issue',
            user: { login: 'a' },
            url: 'https://api.github.com/repos/o/r/issues/6',
            pull_request: {
              url: 'https://api.github.com/repos/o/r/pulls/6',
            },
          },
        ]),
      () => jsonResponse([]),
      () => jsonResponse([]),
      () => jsonResponse([]),
    ]);
    const live = createGithubLive({
      token: 'pat',
      owner: 'o',
      repo: 'r',
      fetchImpl,
    });
    const result = await live.pullMessages();
    expect(result.links.length).toBe(1);
    expect(result.links[0].id).toBe('msg:github:issue:o/r#5');
  });
});

describe('paginate via Link rel="next"', () => {
  it('joins two pages and stops when next is absent', async () => {
    const fetchImpl = queueFetch([
      () =>
        jsonResponse([{ id: 1 }], {
          headers: {
            Link: '<https://api.github.com/user/repos?page=2>; rel="next"',
          },
        }),
      () => jsonResponse([{ id: 2 }]),
    ]);
    const out = await paginate(fetchImpl, 'https://api.github.com/user/repos', {
      headers: { Authorization: 'Bearer pat' },
    });
    expect(out.length).toBe(2);
    expect(out[0].id).toBe(1);
    expect(out[1].id).toBe(2);
  });

  it('listRepos paginates /user/repos', async () => {
    const fetchImpl = queueFetch([
      () =>
        jsonResponse([{ id: 1, name: 'a', full_name: 'o/a' }], {
          headers: {
            Link: '<https://api.github.com/user/repos?page=2>; rel="next"',
          },
        }),
      () => jsonResponse([{ id: 2, name: 'b', full_name: 'o/b' }]),
    ]);
    const live = createGithubLive({
      token: 'pat',
      fetchImpl,
    });
    const repos = await live.listRepos();
    expect(repos.length).toBe(2);
    expect(repos[0].full_name).toBe('o/a');
  });
});

const buildTarball = (files) => {
  const blocks = [];
  for (const file of files) {
    const header = new Uint8Array(512);
    const writeAscii = (offset, value, length) => {
      const bytes = new TextEncoder().encode(value);
      const slice = bytes.slice(0, length);
      header.set(slice, offset);
    };
    const writeOctal = (offset, value, length) => {
      const text = value.toString(8).padStart(length - 1, '0');
      writeAscii(offset, text, length - 1);
      header[offset + length - 1] = 0;
    };
    writeAscii(0, file.name, 100);
    writeAscii(100, '0000644 ', 8);
    writeAscii(108, '0000000 ', 8);
    writeAscii(116, '0000000 ', 8);
    writeOctal(124, file.body.length, 12);
    writeAscii(136, '00000000000 ', 12);
    writeAscii(148, '        ', 8);
    header[156] = '0'.charCodeAt(0);
    writeAscii(257, 'ustar', 6);
    writeAscii(263, '00', 2);
    let checksum = 0;
    for (const byte of header) {
      checksum += byte;
    }
    writeAscii(148, `${checksum.toString(8).padStart(6, '0')}\0 `, 8);
    blocks.push(header);
    const bodyBytes = new TextEncoder().encode(file.body);
    blocks.push(bodyBytes);
    const padding = (512 - (bodyBytes.length % 512)) % 512;
    if (padding > 0) {
      blocks.push(new Uint8Array(padding));
    }
  }
  blocks.push(new Uint8Array(512));
  blocks.push(new Uint8Array(512));
  let total = 0;
  for (const b of blocks) {
    total += b.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of blocks) {
    out.set(b, offset);
    offset += b.length;
  }
  return out;
};

describe('cloneRepo', () => {
  it('reads tar entries from an in-memory USTAR tarball', () => {
    const tar = buildTarball([
      { name: 'repo/README.md', body: '# hello' },
      { name: 'repo/src/main.js', body: 'console.log(1)' },
    ]);
    const entries = readTarEntries(tar);
    expect(entries.length).toBe(2);
    expect(entries[0].name).toBe('repo/README.md');
    expect(new TextDecoder().decode(entries[0].body)).toBe('# hello');
  });

  it('downloads the tarball and writes one link per file plus a repo index', async () => {
    const tar = buildTarball([
      { name: 'repo/README.md', body: 'hello' },
      { name: 'repo/src/main.js', body: 'main' },
    ]);
    const gz = zlib.gzipSync(Buffer.from(tar));
    const fetchImpl = queueFetch([
      () => binaryResponse(new Uint8Array(gz)),
      () =>
        jsonResponse({
          full_name: 'o/r',
          default_branch: 'main',
          description: 'test repo',
          topics: ['ai'],
          pushed_at: '2026-01-01T00:00:00Z',
        }),
    ]);
    const live = createGithubLive({
      token: 'pat',
      owner: 'o',
      repo: 'r',
      fetchImpl,
    });
    const store = createMemoryStore();
    const result = await live.cloneRepo({ store });
    expect(result.fileLinks.length).toBe(2);
    expect(result.indexLink.id).toBe('repo:o/r');
    expect(result.indexLink.defaultBranch).toBe('main');
    expect(result.indexLink.fileCount).toBe(2);
    const all = await store.query();
    const fileLink = all.find((l) => l.id === 'repo:o/r:file:README.md');
    expect(fileLink?.body).toBe('hello');
    const index = all.find((l) => l.id === 'repo:o/r');
    expect(index?.topics).toEqual(['ai']);
  });
});

describe('github post', () => {
  it('issues POST /repos/o/r/issues/{n}/comments with the right body', async () => {
    const fetchImpl = queueFetch([
      (call) => {
        expect(call.url.pathname).toBe('/repos/o/r/issues/22/comments');
        expect(call.init.method).toBe('POST');
        const body = JSON.parse(call.init.body);
        expect(body.body).toBe('hello world');
        expect(call.init.headers.Authorization).toBe('Bearer pat');
        return jsonResponse({ id: 999, body: 'hello world' });
      },
    ]);
    const live = createGithubLive({
      token: 'pat',
      owner: 'o',
      repo: 'r',
      fetchImpl,
    });
    const result = await live.post('hello world', { issueNumber: 22 });
    expect(result.id).toBe(999);
  });

  it('refuses to post without an issueNumber', async () => {
    const live = createGithubLive({
      token: 'pat',
      owner: 'o',
      repo: 'r',
      fetchImpl: async () => jsonResponse({}),
    });
    let caught = null;
    try {
      await live.post('text', {});
    } catch (err) {
      caught = err;
    }
    expect(caught instanceof Error).toBe(true);
  });
});

describe('source registry integration', () => {
  it('exposes github through listSources and getSource', () => {
    expect(listSources().includes('github')).toBe(true);
    const adapter = getSource('github');
    expect(typeof adapter.parseArchive).toBe('function');
    expect(typeof adapter.live).toBe('object');
  });

  it('pullLiveInto wires the github adapter when an explicit live is supplied', async () => {
    const fetchImpl = queueFetch([
      () => jsonResponse([]),
      () => jsonResponse([]),
      () => jsonResponse([]),
      () => jsonResponse([]),
    ]);
    const live = createGithubLive({
      token: 'pat',
      owner: 'o',
      repo: 'r',
      fetchImpl,
    });
    const store = createMemoryStore();
    const result = await pullLiveInto(store, 'github', {
      live,
      token: 'pat',
      owner: 'o',
      repo: 'r',
    });
    expect(result.source).toBe('github');
    expect(result.imported).toBe(0);
  });
});
