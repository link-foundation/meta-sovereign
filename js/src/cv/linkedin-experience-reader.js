import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { openBrowserSession, defaultProfileDir } from './browser.js';
import { resolveBrowserPolicy } from '../browser/policy.js';
import { acquireStoreLock } from '../storage/store-lock.js';
import { ensurePrivateDir, writeFileDurable } from '../storage/durable.js';
import { experienceDocumentToLino } from './experience-document.js';
import { LINO_BINARY } from '../transport/lino.js';
import {
  linkedinExportOptions,
  linkedinExportFailure,
} from './linkedin-experience-record.js';
import { linkedinExperienceDocument } from './linkedin-experience-parse.js';
import { readLinkedinProfileAbout } from './linkedin-profile-reader.js';
import {
  evaluateLinkedin as evaluate,
  linkedinSessionGate as gateFor,
} from './linkedin-experience-session.js';
import {
  linkedinExperienceGate,
  readLinkedinExperienceDocument,
  advanceLinkedinExperience,
} from './linkedin-experience-dom.js';

export { linkedinExportFailure } from './linkedin-experience-record.js';
const trace = (phase) => {
  if (process.env.MS_CV_LINKEDIN_DEBUG === '1') {
    console.error({ event: 'linkedin-experience', phase });
  }
};
const waitForLogin = async (context) => {
  const { session, options, check, now, wait, progress, headless } = context;
  const deadline = now() + 30 * 60000;
  let announced = false;
  for (let attempt = 0; attempt < 1800; attempt++) {
    const gate = await gateFor(session, options.url, check);
    if (now() >= deadline) {
      throw linkedinExportFailure('login-timeout');
    }
    if (gate.ready) {
      return;
    }
    if (headless) {
      throw linkedinExportFailure('login-required');
    }
    if (!announced) {
      announced = true;
      await progress('waiting-login');
    }
    await wait(1000, options.signal);
    check();
  }
  throw linkedinExportFailure('login-timeout');
};
const checkedScan = (raw, url, identities) => {
  if (
    raw.blocked ||
    raw.url !== url ||
    !Array.isArray(raw.items) ||
    raw.items.length > 200 ||
    raw.items.length < identities.length ||
    Buffer.byteLength(JSON.stringify(raw)) > 1024 * 1024
  ) {
    throw linkedinExportFailure('incomplete');
  }
  const current = raw.items.map((item) =>
    JSON.stringify(
      item.fallback
        ? ['text', item.heading.split('\n').slice(0, 3)]
        : [item.parent?.id, item.parent?.title, item.parent?.period]
    )
  );
  if (identities.some((identity, index) => current[index] !== identity)) {
    throw linkedinExportFailure('incomplete');
  }
  return current;
};
export const traverseLinkedinExperience = async ({
  session,
  options,
  check,
  wait,
  now,
  progress,
}) => {
  const deadline = now() + 120000;
  let stable = 0;
  let previous = '';
  let identities = [];
  let clicks = 0;
  for (let pass = 0; pass < 40 && now() < deadline; pass++) {
    check();
    if (!(await gateFor(session, options.url, check)).ready) {
      throw linkedinExportFailure('session');
    }
    const expanded = await evaluate(session, advanceLinkedinExperience, [
      { url: options.url },
    ]);
    check();
    if (expanded.ambiguous) {
      throw linkedinExportFailure('markup');
    }
    if (expanded.clicked) {
      await wait(500, options.signal);
    }
    const raw = await evaluate(session, readLinkedinExperienceDocument);
    check();
    const current = checkedScan(raw, options.url, identities);
    const count = raw.items.length;
    identities = current;
    const signature = createHash('sha256')
      .update(JSON.stringify([raw.items, raw.addEditors]))
      .digest('hex');
    stable =
      raw.bottom &&
      !raw.more &&
      !raw.collapsed &&
      !raw.busy &&
      signature === previous
        ? stable + 1
        : 0;
    previous = signature;
    await progress('reading', { positions: count, passes: pass + 1 });
    if (stable >= 2) {
      return {
        ...raw,
        traversal: { passes: pass + 1, clicks, boundary: 'rendered-bottom' },
      };
    }
    const result = await evaluate(session, advanceLinkedinExperience, [
      { results: Boolean(raw.more), scroll: !raw.more, url: options.url },
    ]);
    clicks += raw.more ? result.clicked : 0;
    if (result.ambiguous || clicks > 20) {
      throw linkedinExportFailure('incomplete');
    }
    await wait(1000, options.signal);
  }
  throw linkedinExportFailure('incomplete');
};
const saveArtifacts = async (folder, document, raw, check) => {
  await fs.mkdir(folder, { mode: 0o700 });
  try {
    const files = [];
    for (const [name, content] of [
      ['linkedin-experience.txt', raw.text],
      ['linkedin-experience.json', JSON.stringify(raw, null, 2)],
      ['experience.lino', experienceDocumentToLino(document)],
      ['experience.bin', experienceDocumentToLino(document, LINO_BINARY)],
    ]) {
      check();
      const limit = name.startsWith('linkedin-')
        ? 2 * 1024 * 1024
        : 4 * 1024 * 1024;
      if (Buffer.byteLength(content) > limit) {
        throw linkedinExportFailure('incomplete');
      }
      await writeFileDurable(path.join(folder, name), content);
      files.push({
        name,
        size: Buffer.byteLength(content),
        sha256: createHash('sha256').update(content).digest('hex'),
      });
    }
    check();
    return files;
  } catch (error) {
    await fs.rm(folder, { recursive: true, force: true });
    throw error;
  }
};
const detach = async (session, discard) => {
  try {
    if (session?.detach) {
      await session.detach();
    } else {
      await session?.close();
    }
  } catch (error) {
    await discard?.();
    throw error;
  }
};
/** One page load in a fixed separate visible profile. Stop waits for detach. */
export const createLinkedinExperienceReader =
  ({
    store,
    artifactRoot,
    openSession = openBrowserSession,
    profileDir = defaultProfileDir('linkedin', 'linkedin-experience'),
    now = Date.now,
    wait = (ms, signal) => delay(ms, undefined, { signal }),
  }) =>
  async (options, progress = async () => {}) => {
    options = { ...linkedinExportOptions(options), signal: options.signal };
    const check = () => options.signal?.throwIfAborted();
    check();
    const lease = await acquireStoreLock(profileDir, { exclusive: true });
    let session;
    let discard;
    try {
      check();
      const { headless } = await resolveBrowserPolicy(store, {
        platform: 'linkedin',
        slot: 'linkedin-experience',
        useCase: 'cv',
      });
      check();
      session = await openSession({
        store,
        platform: 'linkedin',
        slot: 'linkedin-experience',
        useCase: 'cv',
        headless,
        persistent: true,
        profileDir,
        verbose: false,
        locale: options.language === 'ru' ? 'ru-RU' : 'en-US',
      });
      check();
      session.page.setDefaultTimeout?.(10000);
      const existing = await evaluate(session, linkedinExperienceGate);
      check();
      if (existing.draft && !existing.wall) {
        throw linkedinExportFailure('draft');
      }
      await progress('opening', { headless });
      trace('opening');
      await session.commander.goto({
        url: options.url,
        waitUntil: 'domcontentloaded',
        timeout: 30000,
        signal: options.signal,
      });
      check();
      const context = {
        session,
        options,
        check,
        now,
        wait,
        progress,
        headless,
      };
      await waitForLogin(context);
      trace('reading');
      const raw = await traverseLinkedinExperience(context);
      trace('reading-about');
      raw.profileAbout = await readLinkedinProfileAbout(context);
      if (!(await gateFor(session, options.url, check)).ready) {
        throw linkedinExportFailure('session');
      }
      const document = linkedinExperienceDocument(
        raw,
        options,
        new Date(now()).toISOString()
      );
      await ensurePrivateDir(artifactRoot);
      const folder = path.join(artifactRoot, options.requestId);
      const files = await saveArtifacts(folder, document, raw, check);
      discard = () => fs.rm(folder, { recursive: true, force: true });
      return { document, files, discard };
    } finally {
      try {
        await detach(session, discard);
      } finally {
        lease.release();
      }
    }
  };
