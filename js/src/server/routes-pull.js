/**
 * Inbox pulls for the networks that have no live connection of their own
 * (R-Z8): the Connections card's "Fetch now" button and the background
 * schedule behind it.
 *
 * Its routes:
 *   POST /api/pull {source}   -> { ok, source, imported, lastOkAt }
 *                                 or { ok: false, error, code } with `code` one of
 *                                 unsupported | not-connected | rate-limited
 *                                 (HTTP 429, at most one fetch per 15 s per
 *                                 network, `retryAfterMs`) | the network's own code
 *   GET  /api/pull/status     -> { ok, sources: { <source>: { connected,
 *                                 lastOkAt, lastError } } }
 *
 * The same `createPullRunner` (../sources/pull-runner.js) serves every
 * network: add a job to `pullJobs` to give another network a button and a
 * schedule. VK also keeps a Long Poll running (../sources/vk-sync.js).
 */

import { createPullRunner, loadPullState } from '../sources/pull-runner.js';
import { createVkInbox } from '../sources/vk-sync.js';
import { liveOptionsFrom, pullLiveInto } from '../sources/index.js';
import { createUpworkLive } from '../sources/upwork.js';
import { createPeoplePerHourLive } from '../sources/peopleperhour.js';
import { createGithubService } from './github-service.js';
import { handleVkRoutes } from './routes-vk.js';
import { emailConfigured } from '../sources/email-store.js';
import { fail, json, readBody } from './util.js';

const MINUTE = 60_000;

const connected = (store, source) => async () =>
  Boolean((await liveOptionsFrom(store, source)).token);

// `live` for a network whose test double or host is given; the saved token
// still comes from the store.
const liveOf = (make, given) => (given ? make(given) : undefined);

// Mail (R-Z5, on the shared runner since R-Z20): every ten minutes, the first
// pull 30 s after the server listens, never faster than a minute, backed off
// after a failure like every job. `emailPoll: false` keeps only the button.
// `email.pull` (tests) replaces the real pull.
const MIN_EMAIL_MS = MINUTE;
const emailJob = (store, poll = {}) => ({
  ready: async () => emailConfigured(await liveOptionsFrom(store, 'email')),
  run: () =>
    (poll.pull ?? ((s) => pullLiveInto(s, 'email', { limit: 20 })))(store),
  intervalMs:
    poll === false ? 0 : Math.max(MIN_EMAIL_MS, poll.intervalMs ?? 10 * MINUTE),
  firstDelayMs: poll === false ? 0 : (poll.firstMs ?? 30_000),
});

/** The jobs: network -> { ready, run, intervalMs }. */
export const pullJobs = (store, { vkInbox, github, options = {} }) => ({
  ...(github ? { github: github.pullJob() } : {}),
  email: emailJob(store, options.email),
  vk: {
    ready: vkInbox.ready,
    run: vkInbox.fetch,
    intervalMs: 10 * MINUTE,
    firstDelayMs: 30_000,
  },
  upwork: {
    ready: connected(store, 'upwork'),
    run: () =>
      pullLiveInto(store, 'upwork', {
        live: liveOf(createUpworkLive, options.upwork),
      }),
    intervalMs: 5 * MINUTE,
    firstDelayMs: 30_000,
  },
  peopleperhour: {
    ready: connected(store, 'peopleperhour'),
    run: () =>
      pullLiveInto(store, 'peopleperhour', {
        live: liveOf(createPeoplePerHourLive, options.peopleperhour),
      }),
    intervalMs: 5 * MINUTE,
    firstDelayMs: 30_000,
  },
});

/**
 * The pull services for a server: `{ pullRunner, vkInbox, startAll, stopAll }`.
 * `options` (tests): `{ vk: {baseUrl, fetchImpl, wait}, upwork: {baseUrl},
 * peopleperhour: {baseUrl}, minGapMs, intervals }`; `false` turns it all off.
 */
export const createPullServices = (store, log, options = {}, github = null) => {
  const vkInbox = createVkInbox({ store, log, ...options.vk });
  const jobs = pullJobs(store, { vkInbox, github, options });
  for (const [source, intervalMs] of Object.entries(options.intervals ?? {})) {
    jobs[source].intervalMs = intervalMs;
    jobs[source].firstDelayMs = intervalMs;
  }
  const pullRunner = createPullRunner({
    store,
    jobs,
    log,
    minGapMs: options.minGapMs,
  });
  return {
    pullRunner,
    vkInbox,
    start: () => {
      pullRunner.start();
      vkInbox.start();
    },
    // Resolves once the pulls in flight have stored what they fetched.
    stop: () => Promise.all([vkInbox.stop(), pullRunner.stop()]).then(() => {}),
  };
};

const statusOf = async (store, ctx) => {
  const sources = {};
  for (const source of ctx.pullRunner.sources()) {
    const state = await loadPullState(store, source);
    sources[source] = {
      connected: await ctx.pullRunner.connected(source),
      lastOkAt: state.lastOkAt ?? null,
      lastError: state.lastError ?? null,
      // A captcha, or anything else only the user can clear (R-Z20).
      needsAttention: state.lastError?.needsAttention === true,
    };
  }
  return { ok: true, sources };
};

const sourceOf = (body) =>
  typeof body.source === 'string' && /^[a-z]{2,30}$/.test(body.source)
    ? body.source
    : null;

export const handlePullRoutes = async (store, req, res, p, ctx) => {
  if (!ctx.pullRunner) {
    return false;
  }
  if (p.startsWith('/api/vk/')) {
    return handleVkRoutes(req, res, p, ctx);
  }
  if (p === '/api/pull/status' && req.method === 'GET') {
    return json(res, 200, await statusOf(store, ctx)) ?? true;
  }
  if (p !== '/api/pull' || req.method !== 'POST') {
    return false;
  }
  const source = sourceOf(await readBody(req));
  if (!source) {
    return fail(res, 400, 'bad-request', 'a "source" is needed') ?? true;
  }
  const outcome = await ctx.pullRunner.fetchNow(source);
  if (outcome.ok) {
    return json(res, 200, outcome) ?? true;
  }
  const status =
    { 'rate-limited': 429, unsupported: 404, 'not-connected': 409 }[
      outcome.code
    ] ?? 502;
  return json(res, status, outcome) ?? true;
};

/** What a server keeps for the pulls; they start with the other `later` services. */
export const pullContext = (store, log, options, later, emailPoll) => {
  // GitHub's picker routes work even when the pulls are off; its schedule is
  // one more job of the shared runner (R-Z11).
  // Tests give `pulls.githubLiveFactory`, a fake createGithubLive.
  const githubLiveFactory = options?.githubLiveFactory ?? null;
  const github = createGithubService({
    store,
    ctx: { githubLiveFactory },
    log,
  });
  const given = { githubLiveFactory, github };
  if (options === false) {
    return { ...given, pullRunner: null };
  }
  const services = createPullServices(
    store,
    log,
    { ...options, email: emailPoll },
    github
  );
  later.push(services.start);
  return {
    ...given,
    pullRunner: services.pullRunner,
    vkInbox: services.vkInbox,
    stopPulls: services.stop,
  };
};
