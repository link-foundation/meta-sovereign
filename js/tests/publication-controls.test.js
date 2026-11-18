import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { startServer } from './helpers/legacy-server.js';
import { createBroadcastCommands } from '../src/cli/broadcast-commands.js';
import { saveBroadcastCredentials } from '../src/broadcast/credentials.js';

const destination = {
  id: 'news',
  label: 'News channel',
  network: 'telegram',
  kind: 'channel',
  destination: '@news_channel',
};
const fixture = async () => {
  const store = createMemoryStore();
  await saveBroadcastCredentials(store, 'telegram', {
    botToken: 'dummy-controls-secret',
  });
  const calls = [];
  const resolveSource = () => ({
    live: {
      publishPost: async (content) => {
        calls.push({ operation: 'publish', content });
        return { chat: content.chat, messageId: '72' };
      },
      deletePost: async (receipt) => {
        calls.push({ operation: 'delete', receipt });
        return { deleted: true };
      },
      testConnection: async () => {
        calls.push({ operation: 'test' });
        return { ok: true, verified: true, permissionsVerified: false };
      },
    },
  });
  return { store, calls, resolveSource };
};
const withServer = async (run) => {
  const f = await fixture();
  const server = await startServer({
    port: 0,
    store: f.store,
    enableHandlers: false,
    enableSync: false,
    broadcasting: { resolveSource: f.resolveSource },
  });
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(
      `http://127.0.0.1:${server.port}/api/broadcast/${path}`,
      {
        method,
        ...(body === undefined
          ? {}
          : {
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            }),
      }
    );
    return { status: response.status, body: await response.json() };
  };
  try {
    await run({ ...f, request });
  } finally {
    await server.close();
  }
};

test(
  'publication API retains destinations, redacts credentials and requires exact single-use confirmation',
  { timeout: 15000 },
  async () => {
    await withServer(async ({ request, calls }) => {
      assert.equal(
        (await request('targets', 'PUT', { target: destination })).status,
        200
      );
      assert.equal((await request('targets')).body.targets.length, 1);
      const credentials = await request('credentials?network=telegram');
      assert.equal(credentials.body.fields.botToken, true);
      assert.equal(
        JSON.stringify(credentials).includes('dummy-controls-secret'),
        false
      );
      const payload = {
        targetIds: ['news'],
        text: 'News',
        requestId: 'api-publication',
      };
      const preview = await request('publish', 'POST', payload);
      assert.equal(preview.status, 428);
      assert.equal(
        preview.body.preview.targets[0].destination,
        '@news_channel'
      );
      assert.equal(preview.body.preview.bindings, undefined);
      assert.equal(calls.length, 0);
      const altered = await request('publish', 'POST', {
        ...payload,
        text: 'Changed',
        confirmToken: preview.body.confirm.token,
      });
      assert.equal(altered.status, 428);
      assert.equal(calls.length, 0);
      const fresh = await request('publish', 'POST', payload);
      const sent = await request('publish', 'POST', {
        ...payload,
        confirmToken: fresh.body.confirm.token,
      });
      assert.equal(sent.status, 200);
      assert.equal(sent.body.status, 'sent');
      const replay = await request('publish', 'POST', {
        ...payload,
        confirmToken: fresh.body.confirm.token,
      });
      assert.equal(replay.status, 428);
      const confirmedReplay = await request('publish', 'POST', {
        ...payload,
        confirmToken: replay.body.confirm.token,
      });
      assert.equal(confirmedReplay.body.status, 'sent');
      assert.equal(calls.length, 1);
      const deletion = { id: sent.body.id };
      const deletePreview = await request('delete', 'POST', deletion);
      assert.equal(deletePreview.status, 428);
      assert.equal(calls.length, 1);
      const deleted = await request('delete', 'POST', {
        ...deletion,
        confirmToken: deletePreview.body.confirm.token,
      });
      assert.equal(deleted.body.results[0].deletion.status, 'deleted');
      assert.equal(calls.length, 2);
      assert.equal(
        (await request(`history?id=${sent.body.id}`)).body.results[0].receipt
          .messageIds[0],
        '72'
      );
    });
  }
);

test(
  'publication API rejects bad asynchronous target and credential operations as input errors',
  { timeout: 15000 },
  async () => {
    await withServer(async ({ request, calls }) => {
      assert.equal(
        (
          await request('targets', 'PUT', {
            target: { ...destination, token: 'do-not-store' },
          })
        ).status,
        400
      );
      assert.equal(
        (
          await request('credentials', 'PUT', {
            network: 'constructor',
            credentials: {},
          })
        ).status,
        400
      );
      assert.equal(
        (
          await request('credentials', 'PUT', {
            network: 'telegram',
            credentials: { botToken: 12 },
          })
        ).status,
        400
      );
      assert.equal(
        (await request('targets?id=bad%20id', 'DELETE')).status,
        400
      );
      assert.equal((await request('history?id=missing')).status, 404);
      for (const endpoint of [
        'targets',
        'credentials',
        'preview',
        'publish',
        'delete',
        'test',
      ]) {
        for (const invalid of [null, [], 'invalid']) {
          assert.equal(
            (
              await request(
                endpoint,
                ['targets', 'credentials'].includes(endpoint) ? 'PUT' : 'POST',
                invalid
              )
            ).status,
            400,
            `${endpoint}: ${JSON.stringify(invalid)}`
          );
        }
      }
      assert.equal(calls.length, 0);
    });
  }
);

test(
  'publication API refuses stale routing or credentials after its confirmation preview',
  { timeout: 15000 },
  async () => {
    await withServer(async ({ request, calls }) => {
      await request('targets', 'PUT', { target: destination });
      const payload = { targetIds: ['news'], text: 'News' };
      const preview = await request('publish', 'POST', payload);
      await request('targets', 'PUT', {
        target: { ...destination, destination: '@changed_news' },
      });
      const sent = await request('publish', 'POST', {
        ...payload,
        confirmToken: preview.body.confirm.token,
      });
      assert.equal(sent.status, 409);
      assert.equal(sent.body.code, 'stale-preview');
      assert.equal(calls.length, 0);
    });
  }
);

test('CLI destination, masked setup, preview, publication, history and deletion share the same lifecycle', async () => {
  const { store, calls, resolveSource } = await fixture();
  let opened = 0;
  let closed = 0;
  const openStore = async () => {
    opened++;
    return {
      ...store,
      close: async () => {
        closed++;
      },
    };
  };
  const logs = [];
  const log = (line) => logs.push(line);
  const commands = createBroadcastCommands({
    openStore,
    resolveSource,
    createAccount: () => null,
    ask: async () => false,
    askCredential: async () => 'dummy-new-secret',
  });
  assert.equal(
    await commands['broadcast-target-save']({ ...destination }, log),
    0
  );
  assert.equal(
    await commands['broadcast-setup']({ network: 'telegram' }, log),
    0
  );
  assert.equal(
    await commands['broadcast-preview']({ targets: 'news', text: 'News' }, log),
    0
  );
  assert.equal(
    await commands['broadcast-send']({ targets: 'news', text: 'News' }, log),
    0
  );
  assert.equal(calls.length, 0, 'declining the CLI preview cannot publish');
  assert.equal(
    await commands['broadcast-send'](
      { targets: 'news', text: 'News', 'request-id': 'cli-news', yes: true },
      log
    ),
    0
  );
  assert.equal(calls.length, 1);
  assert.equal(await commands['broadcast-history']({ id: 'cli-news' }, log), 0);
  assert.equal(
    await commands['broadcast-delete']({ id: 'cli-news', yes: true }, log),
    0
  );
  assert.equal(calls.length, 2);
  assert.equal(logs.join('\n').includes('dummy-new-secret'), false);
  assert.equal(opened, closed);
});

test('CLI closes storage if account construction or shutdown fails', async () => {
  const { store } = await fixture();
  let closed = 0;
  const openStore = async () => ({
    ...store,
    close: async () => {
      closed++;
    },
  });
  const broken = createBroadcastCommands({
    openStore,
    createAccount: () => {
      throw new Error('account unavailable');
    },
  });
  await assert.rejects(
    broken['broadcast-preview']({}, () => {}),
    /account unavailable/
  );
  const stopping = createBroadcastCommands({
    openStore,
    createAccount: () => ({
      stop: async () => {
        throw new Error('shutdown unavailable');
      },
    }),
  });
  await assert.rejects(
    stopping['broadcast-preview']({}, () => {}),
    /shutdown unavailable/
  );
  assert.equal(closed, 2);
});
