/**
 * Broadcast (R-B4) and profile/resume sync (R-D5, R-D6).
 *
 * Outbound posting wraps each network's adapter; the function below
 * accepts a list of target networks and posts the same message via
 * each adapter's `live.post()` method. Adapters that do not yet
 * implement `post` raise — surfacing the gap clearly rather than
 * silently dropping.
 */

import { getSource } from '../sources/index.js';

// An unknown network is a not-done result, not a crash of the whole run.
const sourceOf = (name) => {
  try {
    return getSource(name);
  } catch {
    return null;
  }
};

// One network's outcome. A network that has no such operation, or whose
// adapter answers `{ ok: false }`, is reported as not done: never ok:true
// for something that did not happen (R-Z4).
const attempt = async (network, what, run) => {
  if (typeof run !== 'function') {
    return {
      network,
      ok: false,
      code: 'unsupported',
      error: `${network} has no ${what}; nothing was changed there`,
    };
  }
  try {
    const result = await run();
    if (result?.ok === false || result?.unsupported === true) {
      return {
        network,
        ok: false,
        code: result.code ?? 'unsupported',
        error: result.error ?? `${network} did not do the ${what}`,
        result,
      };
    }
    return { network, ok: true, result };
  } catch (err) {
    return {
      network,
      ok: false,
      error: err.message,
      ...(err.code ? { code: err.code } : {}),
      ...(err.ambiguous ? { outcome: 'unknown' } : {}),
    };
  }
};

export const broadcast = async (networks, content) => {
  const results = [];
  for (const name of networks) {
    const live = sourceOf(name)?.live;
    results.push(
      await attempt(name, 'post', live?.post && (() => live.post(content)))
    );
  }
  return results;
};

export const syncProfile = async (networks, profile) => {
  const results = [];
  for (const name of networks) {
    const live = sourceOf(name)?.live;
    results.push(
      await attempt(
        name,
        'profile update',
        live?.syncProfile && (() => live.syncProfile(profile))
      )
    );
  }
  return results;
};

export const syncResume = async (networks, resume) => {
  const results = [];
  for (const name of networks) {
    const src = sourceOf(name);
    results.push(
      await attempt(
        name,
        'resume update',
        src?.syncResume && (() => src.syncResume(resume))
      )
    );
  }
  return results;
};

const renderTemplate = (template, contact) =>
  String(template ?? '').replace(/\{(\w+)\}/g, (m, key) => {
    if (key === 'name' || key === 'sender') {
      return contact.id ?? '';
    }
    if (key === 'networks') {
      return (contact.networks ?? []).join(',');
    }
    if (key === 'chats') {
      return (contact.chats ?? []).join(',');
    }
    return m;
  });

const pickFrom = (group) => {
  if (!group?.variations?.length) {
    return null;
  }
  return group.variations[Math.floor(Math.random() * group.variations.length)];
};

/**
 * Mass-personal outreach planner (R-D3).
 *
 * Takes a target audience (already evaluated to contacts) plus either
 * a literal `text` or a `replyGroup` to draw a variation per contact.
 * Returns one envelope per contact × network combo with `mode`:
 *
 *   - `preview` (default) — does not touch any network adapter.
 *   - `queue`             — invokes `broadcast()` so the underlying
 *                            adapter `live.post` is called for each
 *                            envelope. Adapters that lack `live.post`
 *                            still surface in the result with ok=false.
 *
 * The planner is deliberately deterministic in `preview` mode so the
 * UI can render the exact same payloads it will later send.
 */
export const planOutreach = ({
  audience,
  text,
  replyGroup,
  networks = null,
  mode = 'preview',
}) => {
  const envelopes = [];
  for (const contact of audience ?? []) {
    const message = text ? renderTemplate(text, contact) : pickFrom(replyGroup);
    if (!message) {
      continue;
    }
    const targets = (networks ?? contact.networks ?? []).filter(Boolean);
    for (const network of targets) {
      envelopes.push({
        contact: contact.id,
        network,
        text: message,
        chat: contact.chats?.[0] ?? null,
      });
    }
  }
  return { mode, envelopes };
};

export const runOutreach = async (plan) => {
  const results = [];
  for (const env of plan.envelopes ?? []) {
    const r = await broadcast([env.network], env);
    results.push({ ...env, result: r[0] });
  }
  return results;
};
