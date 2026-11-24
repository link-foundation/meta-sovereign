import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVkTokenCommands } from '../src/cli/vk-token-commands.js';
import { dictionaries } from '../src/web/locales/index.js';
import {
  isVkTokenStatus,
  isVkTokenRefusal,
} from '../src/transport/vk-token-status.js';
import {
  encodeWire,
  readWireResponse,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';
import { VK_TOKEN_SECRET_ID } from '../src/sources/vk-token-acquisition.js';
import {
  vkTokenFixture,
  tokenFixtureValue as token,
  waitForToken,
} from '../../experiments/issue-56/vk-token-fixture.mjs';

const request = async (
  fixture,
  action,
  body,
  type = LINO_TEXT,
  headers = {}
) => {
  const response = await fetch(
    `${fixture.base}/api/vk/token${action ? `/${action}` : ''}`,
    {
      headers: { accept: type, 'content-type': type, ...headers },
      ...(action ? { method: 'POST', body: encodeWire(body, type) } : {}),
    }
  );
  return { response, value: await readWireResponse(response) };
};

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `VK token API owns confirmation, cancellation and encrypted acknowledgement (${type})`,
    { timeout: 15000 },
    async () => {
      const fixture = await vkTokenFixture();
      try {
        const read = async () => (await request(fixture, '', null, type)).value;
        assert.equal((await read()).state, 'idle');
        assert.equal(fixture.effects.windows, 0);
        assert.equal(
          (await request(fixture, 'start', {}, type)).response.status,
          409
        );
        const started = await request(
          fixture,
          'start',
          { confirm: true },
          type
        );
        assert.equal(started.response.headers.get('cache-control'), 'no-store');
        assert.equal(started.value.state, 'waiting');
        assert.equal(fixture.effects.windows, 1);
        assert.equal((await read()).id, started.value.id);
        const busy = await request(
          fixture,
          'import',
          { confirm: true, value: token },
          type
        );
        assert.equal(busy.value.code, 'authorization-busy');
        assert.equal(isVkTokenRefusal(busy.value), true);
        assert.equal(
          (await request(fixture, 'cancel', { id: 'stale' }, type)).response
            .status,
          409
        );
        assert.equal(
          (await request(fixture, 'cancel', { id: started.value.id }, type))
            .value.state,
          'cancelled'
        );
        const imported = await request(
          fixture,
          'import',
          { confirm: true, value: token },
          type
        );
        assert.equal(imported.value.state, 'waiting');
        const saved = await waitForToken(read);
        assert.equal(isVkTokenStatus(saved), true);
        assert.equal(saved.code, 'saved');
        assert.equal(fixture.effects.inspections, 1);
        assert.equal(JSON.stringify(saved).includes(token), false);
        const raw = await fixture.store.get(VK_TOKEN_SECRET_ID);
        assert.equal(typeof raw.enc, 'string');
        assert.equal(JSON.stringify(raw).includes(token), false);
      } finally {
        await fixture.close();
      }
    }
  );
}

test(
  'VK token API rejects foreign origins, malformed bodies and methods without credential echoes',
  { timeout: 15000 },
  async () => {
    const fixture = await vkTokenFixture();
    try {
      const denied = await request(
        fixture,
        'import',
        { confirm: true, value: token },
        LINO_TEXT,
        { origin: 'https://foreign.invalid' }
      );
      assert.equal(denied.response.status, 403);
      assert.equal(
        (
          await request(fixture, 'import', {
            confirm: true,
            value: `https://foreign.invalid/#${token}`,
          })
        ).value.code,
        'invalid-token-redirect'
      );
      assert.equal(
        (
          await request(fixture, 'import', {
            confirm: true,
            value: 'https://oauth.vk.com/blank.html#error=access_denied',
          })
        ).value.code,
        'authorization-refused'
      );
      const wrong = await fetch(`${fixture.base}/api/vk/token/start`);
      assert.equal(wrong.status, 405);
      const bad = await fetch(`${fixture.base}/api/vk/token/import`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain', accept: LINO_TEXT },
        body: token,
      });
      assert.ok(bad.status >= 400);
      assert.equal((await bad.text()).includes(token), false);
      assert.equal(fixture.effects.windows, 0);
      assert.equal(fixture.effects.inspections, 0);
    } finally {
      await fixture.close();
    }
  }
);

test(
  'VK token CLI prompts privately and never replays a failed mutation',
  { timeout: 15000 },
  async () => {
    const fixture = await vkTokenFixture();
    const output = [];
    let prompts = 0;
    const command = createVkTokenCommands({
      askSecret: async () => {
        prompts++;
        return token;
      },
    })['vk-token'];
    const args = (action, other = {}) => ({
      _: action ? [action] : [],
      url: fixture.base,
      ...other,
    });
    try {
      assert.equal(await command(args(), (s) => output.push(s)), 0);
      assert.equal(
        await command(args('import', { confirm: true }), (s) => output.push(s)),
        0
      );
      const read = async () => (await request(fixture, '')).value;
      assert.equal((await waitForToken(read)).state, 'saved');
      assert.equal(prompts, 1);
      assert.equal(output.join('').includes(token), false);
      for (const bad of [
        args('import'),
        args('import', { confirm: true, token }),
        args('cancel', { id: 'bad' }),
      ]) {
        await assert.rejects(
          command(bad, () => {}),
          /use vk-token/
        );
      }
      assert.equal(prompts, 1);
      let posts = 0;
      const unavailable = createVkTokenCommands({
        fetchImpl: async () => {
          posts++;
          throw new Error(token);
        },
      })['vk-token'];
      assert.equal(
        await unavailable(args('start', { confirm: true }), (s) =>
          output.push(s)
        ),
        1
      );
      assert.equal(posts, 1);
      assert.equal(output.join('').includes(token), false);
      assert.equal(process.listenerCount('SIGTERM'), 0);
    } finally {
      await fixture.close();
    }
  }
);

test('VK token locales expose every status/action in all four UI languages', () => {
  const keys = Object.keys(dictionaries.en).filter((key) =>
    key.startsWith('vkToken.')
  );
  assert.ok(keys.length >= 30);
  for (const language of ['en', 'ru', 'zh', 'hi']) {
    assert.deepEqual(
      Object.keys(dictionaries[language]).filter((key) =>
        key.startsWith('vkToken.')
      ),
      keys
    );
    assert.ok(
      keys.every(
        (key) =>
          typeof dictionaries[language][key] === 'string' &&
          dictionaries[language][key].length
      )
    );
    assert.ok(dictionaries[language]['vkToken.identity'].includes('{id}'));
  }
});
