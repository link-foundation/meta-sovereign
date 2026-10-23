/**
 * "Sign in to WhatsApp Web" (R-Z9).
 *
 * WhatsApp Web signs in only by a QR code scanned with the phone. This opens
 * a VISIBLE browser window on web.whatsapp.com in the very profile
 * directory the browser sender uses (inside the store, owner only), so the
 * person scans the QR themselves and the session is then there for the
 * sender. Nothing is automated or hidden:
 *   - the QR is never read, clicked, solved or forwarded;
 *   - the window is never headless;
 *   - no other browser profile is opened or read.
 * The page is only watched for the chat list (the signed-in marker of
 * `WEB_UIS.whatsapp.loggedIn`) to report "signed in".
 *
 * One window at a time: a browser profile cannot be shared, so after the
 * sign-in is seen the window closes by itself (a few seconds later, so the
 * session is written to the profile) and the sender can use the profile.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { openBrowserSession } from '../cv/browser.js';
import { firstMatch } from './browser-sender.js';
import { WEB_UIS } from './web-uis.js';

/** The sender's profile for `source`, inside the store (0700). */
export const profileDirIn = (storeDir, source = 'whatsapp') =>
  path.join(storeDir, 'browser-profiles', source);

const MARKER = 'whatsapp-signed-in.json';

export const createWhatsAppWebSignIn = ({
  storeDir,
  openSession = openBrowserSession,
  ui = WEB_UIS.whatsapp,
  pollMs = 1000,
  settleMs = 5000,
  clock = () => new Date(),
  log = () => {},
} = {}) => {
  const profileDir = profileDirIn(storeDir);
  const markerFile = path.join(path.dirname(profileDir), MARKER);
  let session = null;
  let state = 'closed'; // closed | opening | waiting | signed-in
  let signedInAt = null;
  let lastError = null;
  let loop = null;

  const readMarker = async () => {
    try {
      return JSON.parse(await fs.readFile(markerFile, 'utf8')).signedInAt;
    } catch {
      return null;
    }
  };

  const close = async () => {
    const closing = session;
    session = null;
    if (state !== 'signed-in') {
      state = 'closed';
    }
    await closing?.close().catch(() => {});
  };

  // Watch the page until the chat list shows, or the window goes away.
  const watch = async (current) => {
    for (;;) {
      await sleep(pollMs);
      if (session !== current) {
        return;
      }
      let found;
      try {
        found = await firstMatch(current.commander, ui.loggedIn);
      } catch {
        // The person closed the window.
        await close();
        return;
      }
      if (found) {
        await sleep(settleMs);
        signedInAt = clock().toISOString();
        state = 'signed-in';
        await fs.writeFile(markerFile, JSON.stringify({ signedInAt }), {
          mode: 0o600,
        });
        log({ event: 'whatsapp_web_signed_in' });
        await close();
        return;
      }
    }
  };

  return {
    profileDir,

    /** Open the visible window (once) so the person can scan the QR. */
    async start() {
      if (session || state === 'opening') {
        return this.status();
      }
      lastError = null;
      state = 'opening';
      await fs.mkdir(profileDir, { recursive: true, mode: 0o700 });
      await fs.chmod(profileDir, 0o700).catch(() => {});
      try {
        const opened = await openSession({
          platform: 'whatsapp',
          headless: false,
          profileDir,
        });
        session = opened;
        await opened.commander.goto({
          url: ui.loginUrl,
          waitUntil: 'domcontentloaded',
        });
      } catch (error) {
        state = 'closed';
        lastError = error.message;
        await close();
        throw error;
      }
      state = 'waiting';
      const current = session;
      loop = watch(current).catch((error) => {
        lastError = error.message;
        return close();
      });
      return this.status();
    },

    /** Close the window (the profile keeps whatever was signed in). */
    async stop() {
      await close();
      await loop;
      return this.status();
    },

    async status() {
      signedInAt ??= await readMarker();
      return {
        state,
        open: Boolean(session),
        signedIn: state === 'signed-in' || Boolean(signedInAt),
        signedInAt,
        error: lastError,
      };
    },

    /** Resolves when the watcher has finished (tests). */
    done: () => loop,
  };
};
