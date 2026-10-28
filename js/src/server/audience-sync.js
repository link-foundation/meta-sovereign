/**
 * Audience membership sync (R-X13; wired by R-Z7).
 *
 * An audience such as `friends:vk & chat:vk:2000000001` only finds people
 * when their `member:` links are in the store. This reads, through each
 * network's official API and the user's own token, the friends, chat members
 * and community members that the saved audiences and the automations name,
 * and stores them (`syncMembership`). It only reads; nothing is sent.
 *
 *   POST /api/audience/sync { source? }  -> { ok, sources: [{ source, ok,
 *        groups, members, error? }] }  now, for one network or every one
 *        the audiences name
 *
 * It also runs by itself once a day (`MS_AUDIENCE_SYNC_HOURS`, 0 = off,
 * default 24) while the server is up. A network without a token, or one
 * that cannot list a kind of group (Telegram's Bot API has no friends and
 * lists only a chat's administrators), reports that and the rest goes on.
 */

import { clearInterval, setInterval } from 'node:timers';
import { fail, json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';
import { safeMessage } from './redact.js';
import { toAudienceSpec } from '../crm/people.js';
import {
  getSource,
  liveOptionsFrom,
  syncMembership,
} from '../sources/index.js';

const HOUR_MS = 3_600_000;
const SOURCE_NAME = /^[a-z][a-z0-9-]{0,30}$/;

// The groups a spec names: `friends:vk`, `chat:vk:<id>`, `community:vk:<id>`,
// through saved audiences too (each followed once).
const collect = (spec, byId, found, seen = new Set()) => {
  if (!spec || typeof spec !== 'object') {
    return;
  }
  if (Array.isArray(spec.of)) {
    spec.of.forEach((child) => collect(child, byId, found, seen));
  } else if (spec.kind === 'friends' && spec.source) {
    found.set(`${spec.source}\0friends`, [spec.source, { kind: 'friends' }]);
  } else if (['chat', 'community'].includes(spec.kind) && spec.source) {
    const id = String(spec[spec.kind]);
    found.set(`${spec.source}\0${spec.kind}\0${id}`, [
      spec.source,
      { kind: spec.kind, id },
    ]);
  } else if (spec.kind === 'saved' && !seen.has(spec.id)) {
    seen.add(spec.id);
    const link = byId.get(`audience:${spec.id}`);
    safeSpec(link?.spec ?? link?.text, (inner) =>
      collect(inner, byId, found, seen)
    );
  }
};

const safeSpec = (value, use) => {
  try {
    use(toAudienceSpec(value));
  } catch {
    // An audience that does not parse names no group.
  }
};

/** `Map<source, group[]>` named by the saved audiences and automations. */
export const audienceGroups = (links) => {
  const byId = new Map(links.map((l) => [l?.id, l]));
  const found = new Map();
  for (const link of links) {
    const id = String(link?.id ?? '');
    if (id.startsWith('audience:')) {
      safeSpec(link.spec ?? link.text, (s) => collect(s, byId, found));
    } else if (id.startsWith('automation:') && link.audience) {
      safeSpec(link.audience, (s) => collect(s, byId, found));
    }
  }
  const out = new Map();
  for (const [source, group] of found.values()) {
    out.set(source, [...(out.get(source) ?? []), group]);
  }
  return out;
};

// The network's live API and the user's saved options for it, or an error.
const liveFor = async (store, source, resolve) => {
  try {
    return {
      live: resolve(source).live,
      options: await liveOptionsFrom(store, source),
    };
  } catch (error) {
    return { error: safeMessage(error) };
  }
};

// One group at a time, so a group the network refuses does not stop the rest.
const syncSource = async (store, source, groups, resolve, now) => {
  const result = { source, ok: true, groups: 0, members: 0 };
  const prepared = await liveFor(store, source, resolve);
  if (prepared.error) {
    return { ...result, ok: false, error: prepared.error };
  }
  const { live, options } = prepared;
  if (!options.token) {
    return { ...result, ok: false, error: 'no token saved for this network' };
  }
  const errors = [];
  for (const group of groups) {
    try {
      const done = await syncMembership({
        source,
        live,
        groups: [group],
        put: (link) => store.put(link),
        now,
        options,
      });
      result.groups += done.groups.length;
      result.members += done.members;
    } catch (error) {
      // The token itself never appears in what is reported.
      errors.push(safeMessage(error).split(options.token).join('***'));
    }
  }
  return errors.length > 0
    ? { ...result, ok: false, error: errors.join('; ').slice(0, 300) }
    : result;
};

/** Sync every network the audiences name (or just `only`); never throws. */
export const syncAudiences = async ({
  store,
  resolve = getSource,
  only = null,
  now = Date.now(),
}) => {
  const wanted = audienceGroups(
    await store.query((link) => /^(audience|automation):/.test(link?.id ?? ''))
  );
  const sources = [];
  for (const [source, groups] of wanted) {
    if (!only || only === source) {
      sources.push(await syncSource(store, source, groups, resolve, now));
    }
  }
  return { ok: sources.every((s) => s.ok), sources };
};

const DEFAULT_HOURS = 24;

// `MS_AUDIENCE_SYNC_HOURS`: hours between runs, `0` = off, unset = daily.
// Nonsense is ignored for the default with one log line.
const audienceHours = (env, log) => {
  const raw = env?.MS_AUDIENCE_SYNC_HOURS;
  if (raw === undefined || raw === null || raw === '') {
    return DEFAULT_HOURS;
  }
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0) {
    return n;
  }
  log?.({
    level: 'warn',
    event: 'audience_sync_setting_ignored',
    name: 'MS_AUDIENCE_SYNC_HOURS',
  });
  return DEFAULT_HOURS;
};

/** Once a day, once the port is ours; `{ stopAudienceSync }` for the context. */
export const audienceSyncFor = ({
  store,
  log,
  later,
  resolve = getSource,
  env = process.env,
}) => {
  const hours = audienceHours(env, log);
  let timer = null;
  if (hours > 0) {
    later.push(() => {
      timer = setInterval(
        () =>
          syncAudiences({ store, resolve })
            .then((done) =>
              log?.({
                level: 'info',
                event: 'audience_sync',
                sources: done.sources.length,
                ok: done.ok,
              })
            )
            .catch((error) =>
              log?.({
                level: 'warn',
                event: 'audience_sync_failed',
                error: safeMessage(error),
              })
            ),
        hours * HOUR_MS
      );
      timer.unref?.();
    });
  }
  return { stopAudienceSync: () => clearInterval(timer) };
};

export const handleAudienceSyncRoute = async (store, req, res, p, ctx) => {
  if (p !== '/api/audience/sync' || req.method !== 'POST') {
    return false;
  }
  if (!isTrustedMutation(req, ctx.allowOrigins)) {
    return (
      fail(res, 403, 'forbidden', 'must come from the meta-sovereign app') ??
      true
    );
  }
  const body = await readBody(req);
  if (body.source !== undefined && !SOURCE_NAME.test(String(body.source))) {
    return (
      fail(res, 400, 'bad-request', 'source must be a network name') ?? true
    );
  }
  const done = await syncAudiences({
    store,
    resolve: ctx.audienceSources ?? getSource,
    only: body.source ?? null,
  });
  return json(res, 200, done) ?? true;
};
