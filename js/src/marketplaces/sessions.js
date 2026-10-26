import path from 'node:path';
import { promises as fs } from 'node:fs';
import { openBrowserSession } from '../cv/browser.js';
import {
  MARKETPLACES,
  marketplaceProfileId,
  marketplaceProfileUrl,
} from './catalogue.js';
import { captureProfilePage } from './profile-page.js';

const failure = (code) => Object.assign(new Error(code), { code });
const field = (value, length) =>
  typeof value === 'string' ? value.trim().slice(0, length) : '';

/** Whitelist stored/displayed identity fields, dropping all other page data. */
export const cleanMarketplaceProfile = (id, data, now) => {
  const url = marketplaceProfileUrl(id, data?.url);
  const name = field(data?.name, 160).replace(/\s+/g, ' ');
  if (
    data?.challenge === true ||
    !url ||
    !name ||
    /^(?:sign in|log in|login|welcome back|loading|verify|just a moment|your profile$|my profile$|profile$|edit profile$)/i.test(
      name
    )
  ) {
    throw failure('needs-profile');
  }
  return {
    name,
    url,
    headline: field(data.headline, 300),
    bio: field(data.bio, 5000),
    skills: Array.isArray(data.skills)
      ? data.skills
          .slice(0, 64)
          .map((skill) => field(skill, 100))
          .filter(Boolean)
      : [],
    capturedAt: now.toISOString(),
    signInObservedAt: data.signInObserved === true ? now.toISOString() : null,
  };
};

export const createMarketplaceSessions = ({
  store,
  storeDir,
  openSession = openBrowserSession,
  clock = () => new Date(),
}) => {
  const sessions = new Map();
  const opening = new Map();
  let stopping = false;
  const providerOf = (id) => {
    if (!Object.hasOwn(MARKETPLACES, id)) {
      throw failure('unknown-marketplace');
    }
    return MARKETPLACES[id];
  };
  const status = async (id) => {
    const provider = providerOf(id);
    const session = sessions.get(id);
    const open = Boolean(session && !session.page.isClosed?.());
    if (session && !open) {
      sessions.delete(id);
      await session.close().catch(() => {});
    }
    const saved = (await store.get(marketplaceProfileId(id)))?.profile;
    let profile = null;
    if (saved) {
      try {
        profile = cleanMarketplaceProfile(
          id,
          { ...saved, signInObserved: Boolean(saved.signInObservedAt) },
          new Date(saved.capturedAt)
        );
      } catch {
        /* Do not expose malformed or non-profile records. */
      }
    }
    return {
      id,
      label: provider.label,
      open,
      opening: opening.has(id),
      profile,
    };
  };
  const launch = async (id) => {
    const provider = providerOf(id);
    const profileDir = path.join(storeDir, 'browser-profiles', id);
    await fs.mkdir(profileDir, { recursive: true, mode: 0o700 });
    const session = await openSession({
      platform: id,
      profileDir,
      headless: false,
      locale: 'en-US',
    });
    try {
      const saved = (await store.get(marketplaceProfileId(id)))?.profile;
      await session.page.goto(
        marketplaceProfileUrl(id, saved?.url) ?? provider.loginUrl,
        { waitUntil: 'domcontentloaded', timeout: 30_000 }
      );
      sessions.set(id, session);
    } catch (error) {
      await session.close().catch(() => {});
      throw error;
    }
  };
  const open = async (id) => {
    providerOf(id);
    if (stopping) {
      throw failure('server-stopping');
    }
    if (opening.has(id)) {
      await opening.get(id);
      return status(id);
    }
    if ((await status(id)).open) {
      await sessions.get(id)?.page.bringToFront?.();
      return status(id);
    }
    // Recheck after the asynchronous status read: concurrent requests share it.
    if (!opening.has(id)) {
      const pending = launch(id);
      opening.set(id, pending);
    }
    try {
      await opening.get(id);
    } finally {
      opening.delete(id);
    }
    return status(id);
  };
  const close = async (id) => {
    providerOf(id);
    await opening.get(id)?.catch(() => {});
    const session = sessions.get(id);
    sessions.delete(id);
    await session?.close();
    return status(id);
  };
  const capture = async (id) => {
    providerOf(id);
    const session = sessions.get(id);
    if (!session || session.page.isClosed?.()) {
      throw failure('session-closed');
    }
    const before = marketplaceProfileUrl(id, session.page.url());
    if (!before) {
      throw failure('needs-profile');
    }
    const data = await session.page.evaluate(captureProfilePage);
    if (
      marketplaceProfileUrl(id, session.page.url()) !== before ||
      marketplaceProfileUrl(id, data?.url) !== before
    ) {
      throw failure('page-changed');
    }
    const profile = cleanMarketplaceProfile(id, data, clock());
    await store.put({
      id: marketplaceProfileId(id),
      kind: 'marketplace-profile',
      source: id,
      tokens: ['account', 'marketplace', id],
      profile,
    });
    return status(id);
  };
  return {
    status,
    open,
    close,
    capture,
    list: () => Promise.all(Object.keys(MARKETPLACES).map(status)),
    stop: async () => {
      stopping = true;
      await Promise.allSettled(
        [...new Set([...opening.keys(), ...sessions.keys()])].map(close)
      );
    },
  };
};
