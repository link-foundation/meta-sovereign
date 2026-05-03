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

export const broadcast = async (networks, content) => {
  const results = [];
  for (const name of networks) {
    const src = getSource(name);
    try {
      const r = await src.live?.post?.(content);
      results.push({ network: name, ok: true, result: r });
    } catch (err) {
      results.push({ network: name, ok: false, error: err.message });
    }
  }
  return results;
};

export const syncProfile = async (networks, profile) => {
  const results = [];
  for (const name of networks) {
    const src = getSource(name);
    try {
      const r = await src.live?.syncProfile?.(profile);
      results.push({ network: name, ok: true, result: r });
    } catch (err) {
      results.push({ network: name, ok: false, error: err.message });
    }
  }
  return results;
};

export const syncResume = async (networks, resume) => {
  const results = [];
  for (const name of networks) {
    const src = getSource(name);
    try {
      const r = await src.syncResume?.(resume);
      results.push({ network: name, ok: true, result: r });
    } catch (err) {
      results.push({ network: name, ok: false, error: err.message });
    }
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
