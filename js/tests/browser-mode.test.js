// R-AA2: every entry point must keep browser work visible by default.
import { describe, it, expect } from 'test-anywhere';
import { Readable } from 'node:stream';
import { openBrowserSession } from '../src/cv/browser.js';
import { readAllCvs } from '../src/cv/index.js';
import { createCvCommands } from '../src/cli/cv-commands.js';
import { handleCvRoutes } from '../src/server/routes-cv.js';
import { createMemoryStore } from '../src/storage/index.js';

// Record launch options without opening a browser or accessing a profile.
const recorder = () => {
  const launches = [];
  const openSession = async (options) => {
    launches.push(options);
    throw Object.assign(new Error('fixture stops before browser launch'), {
      code: 'fixture-stop',
    });
  };
  return { launches, openSession };
};

describe('visible browser defaults', () => {
  it('starts the shared factory headed and preserves explicit headless mode', async () => {
    for (const headless of [undefined, true, false]) {
      let launched;
      const session = await openBrowserSession({
        ...(headless === undefined ? {} : { headless }),
        importers: {
          'browser-commander': async () => ({
            makeBrowserCommander: () => ({ destroy() {} }),
          }),
        },
        launcher: async (options) => {
          launched = options;
          return { page: {}, close() {} };
        },
      });
      await session.close();
      expect(launched.headless).toBe(headless ?? false);
    }
  });

  it('does not override the default in the CV facade', async () => {
    const capture = recorder();
    await readAllCvs(['hh'], { openSession: capture.openSession });
    expect(capture.launches[0].headless).toBe(false);
  });

  it('uses headed CLI runs unless --headless is explicitly enabled', async () => {
    for (const [args, expected] of [
      [{}, false],
      [{ headless: true }, true],
      [{ headless: 'true' }, true],
      [{ headless: 'false' }, false],
      [{ headed: true }, false],
    ]) {
      const capture = recorder();
      const commands = createCvCommands({
        openStore: async () => createMemoryStore(),
        live: { openSession: capture.openSession },
      });
      await commands['cv-read']({ platforms: 'hh', ...args }, () => {});
      expect(capture.launches[0].headless).toBe(expected);
    }
  });

  it('uses headed API runs and honors an explicit boolean override', async () => {
    for (const headless of [undefined, true, false]) {
      const capture = recorder();
      const body = { platforms: ['hh'], headless };
      const req = Readable.from([Buffer.from(JSON.stringify(body))]);
      req.method = 'POST';
      req.headers = {};
      const res = { writeHead() {}, end() {} };
      await handleCvRoutes(
        createMemoryStore(),
        req,
        res,
        '/api/cv/read',
        null,
        { cvSessionFactory: capture.openSession }
      );
      expect(capture.launches[0].headless).toBe(headless ?? false);
    }
  });
});
