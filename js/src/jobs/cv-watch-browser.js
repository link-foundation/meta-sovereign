import path from 'node:path';
import { promises as fs } from 'node:fs';
import { defaultProfileDir } from '../cv/browser.js';
import { browserName } from '../browser/policy.js';
import { jobsFailure } from './options.js';

export const cvWatchUrl = (value) => {
  const url = new URL(value);
  if (
    url.origin !== 'https://hh.ru' ||
    url.username ||
    url.password ||
    !/^\/(?:resume\/(?:edit\/)?[a-zA-Z\d_-]+(?:\/about)?|profile\/edit\/experience(?:\/\d+)?)(?:\/)?$/u.test(
      url.pathname
    )
  ) {
    throw jobsFailure('cv-page', 'Choose an existing HH CV tab.');
  }
  return url;
};

const allowedCvSocket = (endpoint) =>
  !(
    endpoint.protocol !== 'ws:' ||
    endpoint.hostname !== '127.0.0.1' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    !/^\/devtools\/browser\/[a-zA-Z\d-]+$/u.test(endpoint.pathname)
  );

const existingCvEndpoint = (saved, profileDir, targetId) => {
  const endpoint = new URL(saved.webSocketDebuggerUrl);
  const selected = targetId ?? saved.targetId;
  if (path.resolve(saved.userDataDir ?? '') !== path.resolve(profileDir)) {
    throw jobsFailure('cv-browser', 'The existing browser profile changed.');
  }
  if (
    !allowedCvSocket(endpoint) ||
    !Number.isInteger(saved.remoteDebuggingPort) ||
    saved.remoteDebuggingPort < 1 ||
    saved.remoteDebuggingPort > 65535 ||
    endpoint.port !== String(saved.remoteDebuggingPort) ||
    !/^[a-zA-Z\d]{1,100}$/u.test(selected ?? '')
  ) {
    throw jobsFailure('cv-browser', 'The existing browser identity changed.');
  }
  return { endpoint, selected };
};

/** Connect only. An absent browser or exact tab is never replaced or launched. */
export const attachCvWatchBrowser = async ({
  browserSlot,
  targetId,
  profileDir = defaultProfileDir('hh', browserName(browserSlot)),
  loadCommander = () => import('browser-commander'),
}) => {
  const file = path.join(profileDir, '.browser-commander-session.json');
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.size > 16384) {
    throw jobsFailure(
      'cv-browser',
      'The existing browser identity is unavailable.'
    );
  }
  const saved = JSON.parse(await fs.readFile(file, 'utf8'));
  const { endpoint, selected } = existingCvEndpoint(
    saved,
    profileDir,
    targetId
  );
  const bc = await loadCommander();
  const session = await bc.connectBrowser({
    engine: 'playwright',
    wsEndpoint: endpoint.href,
    targetId: selected,
    fallback: false,
    timeout: 10000,
  });
  try {
    cvWatchUrl(session.page.url());
    const commander = bc.makeBrowserCommander({
      page: session.page,
      enableNetworkTracking: false,
      enableNavigationManager: false,
      enableDialogManager: false,
    });
    return {
      page: session.page,
      commander,
      async detach() {
        try {
          await commander.destroy();
        } finally {
          await session.detach();
        }
      },
    };
  } catch (error) {
    await session.detach();
    throw error;
  }
};
