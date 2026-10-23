/**
 * GitHub as a full inbox, server side (R-Z11).
 *
 * Which repositories to pull and how often is a saved setting
 * (`settings:github`); where each pull stopped is a cursor link
 * (`cursor:github:<owner/repo>`) written only after the pulled links were
 * stored (R-Z14), so a failed write repeats the same window. A repository
 * that fails does not stop the others; a rate limit stops the run and says
 * when to come back. Notifications are fetched into `notification:github:*`
 * links and marked read only by an explicit call.
 *
 * There is no timer here: `pullJob()` is the job the shared pull runner
 * (../sources/pull-runner.js, R-Z8) registers as `github`, so "Fetch now" and
 * the schedule are the runner's. The schedule is off until the user picks
 * repositories and an interval.
 */

import { createGithubLive } from '../sources/github.js';
import { stampSourceLink } from '../sources/index.js';
import { loadPullState, savePullState } from '../sources/pull-runner.js';
import { safeMessage } from './redact.js';

const SETTINGS_ID = 'settings:github';
const cursorId = (key) => `cursor:github:${key}`;
const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const MAX_REPOS = 200;
const MIN_INTERVAL_MINUTES = 5;
const MAX_INTERVAL_MINUTES = 24 * 60;

export const DEFAULT_SETTINGS = Object.freeze({
  repos: [],
  intervalMinutes: 0,
  notifications: false,
  discussions: false,
});

const secretValue = (link) =>
  link?.token ?? link?.value ?? link?.body ?? link?.text ?? null;

export const readGithubToken = async (store, { secretId } = {}) => {
  const ids = [
    secretId,
    'secret:github:access-token',
    'secret:github:token',
  ].filter(Boolean);
  for (const id of ids) {
    const token = secretValue(await store.get(id));
    if (token) {
      return token;
    }
  }
  return null;
};

export const githubLive = async (store, body, ctx) => {
  const token = body.token ?? (await readGithubToken(store, body));
  const factory = ctx?.githubLiveFactory ?? createGithubLive;
  const live = factory({
    token,
    owner: body.owner ?? null,
    repo: body.repo ?? null,
  });
  return { token, live };
};

const invalid = (message) =>
  Object.assign(new Error(message), { code: 'bad-request' });

/** The settings a request may save, or a `bad-request` error. */
export const checkSettings = (input = {}) => {
  const repos = input.repos ?? [];
  if (
    !Array.isArray(repos) ||
    repos.length > MAX_REPOS ||
    !repos.every((r) => typeof r === 'string' && REPO.test(r))
  ) {
    throw invalid('repos must be a list of owner/repo names');
  }
  const interval = Number(input.intervalMinutes ?? 0);
  if (
    !Number.isInteger(interval) ||
    (interval !== 0 &&
      (interval < MIN_INTERVAL_MINUTES || interval > MAX_INTERVAL_MINUTES))
  ) {
    throw invalid(
      `intervalMinutes must be 0 (off) or ${MIN_INTERVAL_MINUTES}..${MAX_INTERVAL_MINUTES}`
    );
  }
  return {
    repos: [...new Set(repos)],
    intervalMinutes: interval,
    notifications: input.notifications === true,
    discussions: input.discussions === true,
  };
};

const errorEntry = (error) => ({
  error: safeMessage(error),
  code: error.code ?? 'github-error',
  ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
});

const putAll = async (store, links) => {
  for (const link of links) {
    await store.put(stampSourceLink(link, 'github'));
  }
};

// One repository: pull, store, then (only then) move its cursor.
const fetchRepo = async (env, live, token, key, options) => {
  const { store, now } = env;
  const [owner, repo] = key.split('/');
  const cursor = (await store.get(cursorId(key))) ?? {};
  const result = await live.pullMessages({
    owner,
    repo,
    token,
    since: cursor.since ?? null,
    etags: cursor.etags ?? {},
  });
  const found = options.discussions
    ? await fetchDiscussionsOf(env, live, { owner, repo, token, cursor })
    : { links: [], since: cursor.discussionsSince ?? null, note: null };
  await putAll(store, [...result.links, ...found.links]);
  // After the store write: a failed write above leaves the cursor as it was.
  await store.put({
    id: cursorId(key),
    source: 'github',
    since: result.since,
    etags: result.etags,
    discussionsSince: found.since,
    fetchedAt: new Date(now()).toISOString(),
  });
  return {
    repo: key,
    imported: result.links.length + found.links.length,
    rawCount: result.rawCount,
    notModified: result.notModified,
    discussions: options.discussions ? found.links.length : null,
    ...(found.note ? { discussionsNote: found.note } : {}),
  };
};

// Discussions need a token with access; without it the repository still
// pulls and the reason is reported (a rate limit still stops the run).
const fetchDiscussionsOf = async (
  env,
  live,
  { owner, repo, token, cursor }
) => {
  const startedAt = new Date(env.now()).toISOString();
  try {
    const found = await live.fetchDiscussions({
      owner,
      repo,
      token,
      since: cursor.discussionsSince ?? null,
    });
    return { links: found.links, since: startedAt, note: null };
  } catch (error) {
    if (error.code === 'rate-limited') {
      throw error;
    }
    return {
      links: [],
      since: cursor.discussionsSince ?? null,
      note: errorEntry(error),
    };
  }
};

// The notification inbox, never faster than the interval GitHub asked for.
const fetchNotes = async ({ store, now }, live, token) => {
  const id = cursorId('notifications');
  const cursor = (await store.get(id)) ?? {};
  const next = Number(cursor.nextPollAt ?? 0);
  if (next > now()) {
    return { skipped: 'poll-interval', nextPollAt: next };
  }
  const startedAt = new Date(now()).toISOString();
  const found = await live.fetchNotifications({
    token,
    since: cursor.since ?? null,
    lastModified: cursor.lastModified ?? null,
  });
  await putAll(store, found.links);
  const pollInterval = found.pollInterval ?? cursor.pollInterval ?? 60;
  await store.put({
    id,
    source: 'github',
    since: found.notModified ? (cursor.since ?? startedAt) : startedAt,
    lastModified: found.lastModified,
    pollInterval,
    nextPollAt: now() + pollInterval * 1000,
  });
  return { imported: found.links.length, notModified: found.notModified };
};

const storedNotifications = async (store) => {
  const all = await store.query(
    (l) => typeof l?.id === 'string' && l.id.startsWith('notification:github:')
  );
  return all
    .filter((l) => !l.deleted)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
};

// A repository that fails does not stop the others; a rate limit does.
const runAll = async (env, saved, wanted, { token, live }, log) => {
  const out = { repos: [], notifications: null, rateLimited: null };
  const limited = (error) => {
    if (error.code === 'rate-limited') {
      out.rateLimited = { retryAfter: error.retryAfter };
    }
  };
  for (const key of wanted) {
    if (out.rateLimited) {
      out.repos.push({ repo: key, skipped: 'rate-limited' });
      continue;
    }
    try {
      out.repos.push(await fetchRepo(env, live, token, key, saved));
    } catch (error) {
      out.repos.push({ repo: key, ...errorEntry(error) });
      limited(error);
      log?.({ level: 'warn', event: 'github_fetch_failed', repo: key });
    }
  }
  if (saved.notifications && !out.rateLimited) {
    out.notifications = await fetchNotes(env, live, token).catch((error) => {
      limited(error);
      return errorEntry(error);
    });
  }
  out.imported = out.repos.reduce((n, r) => n + (r.imported ?? 0), 0);
  return out;
};

/**
 * @param {object} options
 * @param {object} options.store
 * @param {object} [options.ctx] server context (`githubLiveFactory`)
 * @param {() => number} [options.now]
 * @param {Function} [options.log]
 */
export const createGithubService = ({
  store,
  ctx = {},
  now = () => Date.now(),
  log = null,
}) => {
  const env = { store, now };
  let running = null;

  const settings = async () => {
    const { repos, intervalMinutes, notifications, discussions } = {
      ...DEFAULT_SETTINGS,
      ...((await store.get(SETTINGS_ID)) ?? {}),
    };
    return { repos, intervalMinutes, notifications, discussions };
  };

  const saveSettings = async (input) => {
    const next = checkSettings(input);
    await store.put({ id: SETTINGS_ID, source: 'github', ...next });
    return next;
  };

  const withLive = async () => {
    const { token, live } = await githubLive(store, {}, ctx);
    if (!token) {
      throw Object.assign(new Error('save a GitHub access token first'), {
        code: 'no-token',
      });
    }
    return { token, live };
  };

  const listRepos = async () => {
    const { token, live } = await withLive();
    const repos = await live.listRepos({ token });
    const chosen = new Set((await settings()).repos);
    return repos.map((r) => ({
      fullName: r.full_name,
      private: Boolean(r.private),
      description: r.description ?? '',
      updatedAt: r.pushed_at ?? r.updated_at ?? null,
      selected: chosen.has(r.full_name),
    }));
  };

  const run = async (options = {}) => {
    const saved = await settings();
    const access = await withLive();
    const wanted = options.repos?.length ? options.repos : saved.repos;
    return runAll(env, saved, wanted, access, log);
  };

  // One run at a time: a second request waits for and shares the first.
  const fetchNow = (options) => {
    running ??= run(options).finally(() => {
      running = null;
    });
    return running;
  };

  const notifications = () => storedNotifications(store);

  // Marking read changes GitHub: only on an explicit call (never by fetching).
  const markRead = async ({ threadId = null, all = false } = {}) => {
    const { token, live } = await withLive();
    if (all) {
      await live.markAllRead({ token });
      for (const link of await notifications()) {
        await store.put({ ...link, unread: false });
      }
      return { ok: true, all: true };
    }
    await live.markThreadRead(threadId, { token });
    const link = await store.get(`notification:github:${threadId}`);
    if (link) {
      await store.put({ ...link, unread: false });
    }
    return { ok: true, threadId: String(threadId) };
  };

  // The runner's job. A rate limit is remembered (`notBefore` in the pull
  // state), so neither the schedule nor a click asks GitHub again before it
  // allows, and the wait is reported instead of looped on.
  const waitLeft = async () =>
    Math.ceil(
      (Number((await loadPullState(store, 'github')).notBefore ?? 0) - now()) /
        1000
    );
  const limitError = (seconds) =>
    Object.assign(new Error('GitHub rate limit reached; try again later'), {
      code: 'rate-limited',
      retryAfter: Math.max(1, seconds),
    });
  const pullJob = () => ({
    ready: async () => Boolean(await readGithubToken(store)),
    intervalMs: 60_000,
    firstDelayMs: 30_000,
    due: async () => {
      const saved = await settings();
      if (!saved.intervalMinutes || saved.repos.length === 0) {
        return false;
      }
      const state = await loadPullState(store, 'github');
      const last = Date.parse(state.lastOkAt ?? '') || 0;
      return (
        now() >=
        Math.max(last + saved.intervalMinutes * 60_000, state.notBefore ?? 0)
      );
    },
    run: async () => {
      const left = await waitLeft();
      if (left > 0) {
        throw limitError(left);
      }
      const out = await fetchNow({});
      if (out.rateLimited) {
        const seconds = out.rateLimited.retryAfter ?? 60;
        await savePullState(store, 'github', {
          notBefore: now() + seconds * 1000,
        });
        throw limitError(seconds);
      }
      await savePullState(store, 'github', { notBefore: 0 });
      return { imported: out.imported };
    },
  });

  return {
    settings,
    saveSettings,
    listRepos,
    fetchNow,
    notifications,
    markRead,
    pullJob,
  };
};
