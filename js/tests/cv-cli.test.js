// Issue #29 / R-V17: the CV subcommands. The catalogue, the plans and
// the stored diff answer without a browser; read/sync drive one
// through an injected commander, and telemetry replays the run.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'test-anywhere';

import { createFakeCommander } from './helpers/fake-commander.js';
import { createMemoryStore } from '../src/storage/index.js';
import { runCli } from '../src/cli/index.js';
import {
  createCvCommands,
  parsePlatforms,
  parseVars,
} from '../src/cli/cv-commands.js';

const stateJson = readFileSync(
  fileURLToPath(
    new URL('./fixtures/habr-career-profile-state.json', import.meta.url)
  ),
  'utf8'
);

const SSR = 'script[type="application/json"][data-ssr-state="true"]';

const habrCommander = () =>
  createFakeCommander({
    pages: {
      'https://career.habr.com/anna': {
        nodes: {
          [SSR]: [{ text: stateJson }],
          '.page-title__title': [{ text: 'Анна Буянова' }],
          body: [{ text: '', html: '<body><div>cv</div></body>' }],
        },
      },
    },
  });

/** Commands bound to one in-memory store and a fake browser. */
const cvCli = (store = createMemoryStore()) => {
  const commands = createCvCommands({
    openStore: async () => store,
    live: { commander: habrCommander() },
  });
  const run = async (name, args = {}) => {
    const out = [];
    const code = await commands[name](args, (line) => out.push(line));
    return { code, out, text: out.join('\n') };
  };
  return { run, store };
};

describe('cv cli catalogue', () => {
  it('lists every platform the issue names', async () => {
    const out = [];
    const code = await runCli(['cv-platforms'], { log: (m) => out.push(m) });
    expect(code).toBe(0);
    const text = out.join('\n');
    for (const id of [
      'linkedin',
      'hh',
      'habr-career',
      'naukri',
      'vietnamworks',
      'topcv',
    ]) {
      expect(text).toContain(id);
    }
  });

  it('prints a plan with its steps, write groups and evidence', async () => {
    const out = [];
    const code = await runCli(['cv-plan', '--platform=vietnamworks'], {
      log: (m) => out.push(m),
    });
    expect(code).toBe(0);
    const text = out.join('\n');
    expect(text).toContain('read   goto');
    expect(text).toContain('write  ');
    expect(text).toContain('source ');
  });

  it('reports an unknown platform as a message, not a stack trace', async () => {
    const out = [];
    const code = await runCli(['cv-plan', '--platform=nope'], {
      log: (m) => out.push(m),
    });
    expect(code).toBe(1);
    expect(out[0]).toContain('Unknown CV platform');
    expect(out[0]).toContain('topcv');
  });

  it('advertises the cv commands in the help text', async () => {
    const out = [];
    await runCli(['help'], { log: (m) => out.push(m) });
    const text = out.join('\n');
    for (const command of [
      'cv-platforms',
      'cv-plan',
      'cv-read',
      'cv-diff',
      'cv-sync',
      'cv-telemetry',
    ]) {
      expect(text).toContain(command);
    }
  });
});

describe('cv cli option parsing', () => {
  it('defaults to every platform and validates the requested ids', () => {
    expect(parsePlatforms('').length).toBeGreaterThan(6);
    expect(parsePlatforms('topcv, hh')).toEqual(['topcv', 'hh']);
    let message = '';
    try {
      parsePlatforms('hh,nope');
    } catch (error) {
      message = error.message;
    }
    expect(message).toContain('Unknown CV platform: nope');
  });

  it('merges --login into the --vars object', () => {
    expect(parseVars({ vars: '{"resumeId":"7"}', login: 'anna' })).toEqual({
      resumeId: '7',
      login: 'anna',
    });
  });
});

describe('cv cli live commands', () => {
  it('reads a platform, then diffs and replays what it stored', async () => {
    const { run, store } = cvCli();

    const read = await run('cv-read', {
      platforms: 'habr-career',
      login: 'anna',
    });
    expect(read.code).toBe(0);
    expect(read.text).toContain('habr-career');
    expect(read.text).toMatch(/\d+ fields/);

    const diff = await run('cv-diff', { platforms: 'habr-career', json: true });
    const parsed = JSON.parse(diff.text);
    expect(parsed.entries[0].cv.basics.name).toBe('Анна Буянова');

    const telemetry = await run('cv-telemetry', {});
    expect(telemetry.code).toBe(0);
    expect(telemetry.text).toContain('habr-career');
    expect(telemetry.text).toContain('run.start=1');

    const filtered = await run('cv-telemetry', {
      type: 'step.error',
      json: true,
    });
    expect(JSON.parse(filtered.text).events).toEqual([]);
    expect((await store.query()).length).toBeGreaterThan(0);
  });

  it('says so when no snapshot has been read yet', async () => {
    const { run } = cvCli();
    const diff = await run('cv-diff', {});
    expect(diff.code).toBe(1);
    expect(diff.text).toContain('cv-read');
  });

  it('plans a sync without writing to a live profile by default', async () => {
    const { run } = cvCli();
    const sync = await run('cv-sync', {
      platforms: 'habr-career',
      login: 'anna',
    });
    expect(sync.code).toBe(0);
    expect(sync.text).toContain('dry run');
    expect(sync.text).toContain('habr-career');
  });

  it('reports a failing platform with its code and exits non-zero', async () => {
    const { run } = cvCli();
    const read = await run('cv-read', {
      platforms: 'habr-career,linkedin',
      login: 'anna',
    });
    expect(read.code).toBe(1);
    expect(read.text).toContain('! linkedin');
  });
});
