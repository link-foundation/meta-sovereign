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
