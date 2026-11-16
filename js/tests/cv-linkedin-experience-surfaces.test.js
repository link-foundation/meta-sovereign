import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { startServer } from '../src/server/index.js';
import { createCvCommands } from '../src/cli/cv-commands.js';
import { createExperienceApi } from '../src/web/cv-experience-api.js';
import { createLinkedinExperienceState } from '../src/web/cv-linkedin-experience-state.js';
import { foregroundLinkedinExperience } from '../src/cli/cv-linkedin-experience-command.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import {
  linkedinReaderFixture,
  linkedinExportInput,
} from '../../experiments/issue-56/linkedin-experience-fixture.mjs';
import { settledLinkedinFixture } from '../../experiments/issue-56/linkedin-export-settled.mjs';

test(
  'HTTP native exports use both Lino formats, trusted mutations, private reads and stop on server shutdown',
  { timeout: 10000 },
  async () => {
    const fixture = await linkedinReaderFixture();
    const server = await startServer({
      port: 0,
      store: fixture.store,
      cv: {
        experience: { artifactRoot: fixture.artifactRoot, read: fixture.read },
      },
      enableHandlers: false,
      enableSync: false,
      telegramAccount: false,
      automations: { scheduler: false },
    });
    const base = `http://127.0.0.1:${server.port}/api/cv/experience/linkedin-`;
    const request = async (op, type, input, origin) => {
      const read = ['status', 'evidence'].includes(op);
      const response = await fetch(
        `${base}${op}${read ? `?${new URLSearchParams(input)}` : ''}`,
        {
          method: read ? 'GET' : 'POST',
          headers: {
            accept: type,
            ...(read ? {} : { 'content-type': type }),
            ...(origin ? { origin } : {}),
          },
          ...(read ? {} : { body: encodeWire(input, type) }),
        }
      );
      if (response.status !== 403) {
        assert.equal(
          response.headers.get('cache-control'),
          'private, no-store'
        );
      }
      return { status: response.status, row: await readWireResponse(response) };
    };
    try {
      for (const [index, type] of [LINO_TEXT, LINO_BINARY].entries()) {
        const input = linkedinExportInput(`native-http-${index}`);
        assert.equal(
          (await request('start', type, input, 'https://untrusted.example'))
            .status,
          403
        );
        assert.equal((await request('start', type, input)).status, 200);
        const row = await settledLinkedinFixture(
          async () =>
            (await request('status', type, { requestId: input.requestId })).row
        );
        assert.equal(row.phase, 'completed');
        assert.equal(
          (await request('start', type, input)).row.revision,
          row.revision
        );
        assert.equal(
          (
            await request('evidence', type, {
              requestId: input.requestId,
              name: 'linkedin-experience.txt',
            })
          ).status,
          200
        );
        assert.equal(
          (await request('stop', type, input, 'https://untrusted.example'))
            .status,
          403
        );
        assert.equal(
          (await request('stop', type, input)).row.phase,
          'completed'
        );
      }
      assert.equal(fixture.calls.filter(([name]) => name === 'open').length, 2);
    } finally {
      await server.close();
      await fixture.close();
    }
  }
);

test('foreground CLI reports manual sign-in and drains cancellation before returning', async () => {
  const notices = [];
  const calls = [];
  const input = linkedinExportInput();
  const service = {
    start: async () => ({ ...input, phase: 'waiting-login' }),
    status: async () => ({ ...input, phase: 'stopped' }),
    stop: async () => {
      await delay(1);
      calls.push('drained');
    },
  };
  const row = await foregroundLinkedinExperience(service, input, {
    notice: (text) => notices.push(text),
    wait: async () => {
      process.emit('SIGINT');
    },
  });
  assert.equal(row.phase, 'stopped');
  assert.equal(notices.length, 1);
  assert.deepEqual(calls, ['drained']);
});

test('CLI native Start waits for acknowledged completion and read-only commands never launch again', async () => {
  const fixture = await linkedinReaderFixture();
  const opens = [];
  let closed = 0;
  fixture.store.close = async () => {
    closed++;
  };
  const commands = createCvCommands({
    openStore: async () => {
      opens.push('write');
      return fixture.store;
    },
    openReadOnly: async () => {
      opens.push('read');
      return fixture.store;
    },
    live: {
      experience: {
        read: fixture.read,
        artifactRoot: fixture.artifactRoot,
        wait: async () => delay(1),
      },
    },
  });
  const output = [];
  const args = {
    ...linkedinExportInput(),
    'request-id': linkedinExportInput().requestId,
  };
  try {
    assert.equal(
      await commands['cv-experience-linkedin-start'](args, (text) =>
        output.push(JSON.parse(text))
      ),
      0
    );
    assert.equal(output.at(-1).phase, 'completed');
    for (const op of ['status', 'start', 'evidence', 'stop']) {
      assert.equal(
        await commands[`cv-experience-linkedin-${op}`](
          { ...args, name: 'linkedin-experience.json' },
          (text) => output.push(JSON.parse(text))
        ),
        0
      );
    }
    assert.equal(fixture.calls.filter(([name]) => name === 'open').length, 1);
    assert.deepEqual(opens, ['write', 'read', 'write', 'read', 'write']);
    assert.equal(closed, 5);
  } finally {
    await fixture.close();
  }
});

test('CLI disk recovery does not claim another process stopped or died', async () => {
  const input = linkedinExportInput('another-process-export');
  const { newLinkedinExport } =
    await import('../src/cv/linkedin-experience-record.js');
  let closed = false;
  const commands = createCvCommands({
    openStore: async () => {
      throw new Error('Writer must not open');
    },
    openReadOnly: async () => ({
      get: async () => ({
        ...newLinkedinExport(input.requestId, input),
        phase: 'waiting-login',
      }),
      close: async () => {
        closed = true;
      },
    }),
  });
  const rows = [];
  assert.equal(
    await commands['cv-experience-linkedin-status'](
      { 'request-id': input.requestId },
      (text) => rows.push(JSON.parse(text))
    ),
    0
  );
  assert.equal(rows[0].phase, 'unknown');
  assert.equal(rows[0].lastPhase, 'waiting-login');
  assert.equal(closed, true);
});

test('browser export control recovers an ambiguous POST with GET only and retains all input', async () => {
  const calls = [];
  const scheduled = [];
  const api = createExperienceApi({
    report: async (url, input) => {
      calls.push(['POST', url, input]);
      throw new Error('lost response');
    },
    get: async (url) => {
      calls.push(['GET', url]);
      return { requestId: 'browser-export', phase: 'waiting-login' };
    },
  });
  const state = createLinkedinExperienceState(api, () => {}, {
    uuid: () => 'browser-export',
    schedule: (fn) => {
      scheduled.push(fn);
      return scheduled.length;
    },
    cancel: () => {},
  });
  try {
    state.input('url', linkedinExportInput().url);
    state.input('language', 'ru');
    assert.equal(await state.mutate('Start'), false);
    assert.equal(state.state.unknown, true);
    assert.equal(await state.mutate('Start'), false);
    await scheduled.at(-1)();
    assert.equal(state.state.row.phase, 'waiting-login');
    assert.equal(state.state.url, linkedinExportInput().url);
    assert.equal(state.state.language, 'ru');
    assert.equal(calls.filter(([method]) => method === 'POST').length, 1);
    assert.equal(calls.filter(([method]) => method === 'GET').length, 1);
  } finally {
    state.dispose();
  }
});

test('Stop wins a late status response; evidence and disposal never overwrite input or repeat Start', async () => {
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const downloads = [];
  const state = createLinkedinExperienceState(
    {
      cvLinkedinExperienceStatus: () => pending,
      cvLinkedinExperienceStop: async ({ requestId }) => ({
        requestId,
        phase: 'stopped',
      }),
      cvLinkedinExperienceStart: async ({ requestId }) => ({
        requestId,
        phase: 'completed',
        revision: 'a'.repeat(64),
      }),
      cvLinkedinExperienceEvidence: async ({ name }) => ({
        name,
        text: 'native evidence',
      }),
    },
    () => {},
    {
      uuid: () => 'race-export',
      schedule: () => 1,
      cancel: () => {},
      download: (file) => downloads.push(file),
    }
  );
  const read = state.refresh();
  await state.mutate('Stop');
  finish({ requestId: 'race-export', phase: 'reading' });
  await read;
  assert.equal(state.state.row.phase, 'stopped');
  state.newRequest();
  state.input('url', linkedinExportInput().url);
  await state.mutate('Start');
  assert.equal(state.state.row.phase, 'completed');
  await state.evidence('linkedin-experience.txt');
  assert.equal(downloads.length, 1);
  assert.equal(state.state.url, linkedinExportInput().url);
  state.dispose();
  assert.equal(await state.mutate('Start'), false);
});

test(
  'server shutdown aborts and drains manual login before closing storage',
  { timeout: 10000 },
  async () => {
    const fixture = await linkedinReaderFixture();
    let entered;
    const waiting = new Promise((resolve) => {
      entered = resolve;
    });
    let drained = false;
    const server = await startServer({
      port: 0,
      store: fixture.store,
      cv: {
        experience: {
          read: async ({ signal }, progress) => {
            await progress('waiting-login');
            entered();
            await new Promise((resolve) =>
              signal.addEventListener('abort', resolve, { once: true })
            );
            await delay(1);
            drained = true;
            signal.throwIfAborted();
          },
        },
      },
      enableHandlers: false,
      enableSync: false,
      telegramAccount: false,
      automations: { scheduler: false },
    });
    try {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/api/cv/experience/linkedin-start`,
        {
          method: 'POST',
          headers: { 'content-type': LINO_TEXT },
          body: encodeWire(linkedinExportInput()),
        }
      );
      assert.equal(response.status, 200);
      await response.arrayBuffer();
      await waiting;
      await server.close();
      assert.equal(drained, true);
      const records = await fixture.store.query();
      assert.equal(
        records.find((row) => row.requestId === linkedinExportInput().requestId)
          .phase,
        'stopped'
      );
    } finally {
      await server.close();
      await fixture.close();
    }
  }
);
