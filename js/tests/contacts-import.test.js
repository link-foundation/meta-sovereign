import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { decodeVcard, parseVcard } from '../src/sources/vcard.js';
import {
  planContactsImport,
  applyContactsImport,
} from '../src/sources/contacts-import.js';
import { aggregateContacts } from '../src/server/aggregate.js';
import { startServer } from '../src/server/index.js';
import { runCli } from '../src/cli/index.js';

const card = (
  fields = 'UID:alice\nFN:Alice Lee\nEMAIL:ALICE@example.test\nTEL;TYPE=CELL:+1 (555) 0100'
) => `BEGIN:VCARD\nVERSION:3.0\n${fields}\nEND:VCARD\n`;

test('vCards keep folded Unicode names, escaped structured values, grouped fields and v4 URIs', () => {
  const [alice, bob] = parseVcard(
    `${card(
      'UID:alice\nFN:Алиса \n Ли\nitem1.EMAIL:alice@example.test\nN:Lee;Alice;;;\nORG:Team\\; Labs;Research\nADR:;;Main\\, 1;City;;123;Country'
    )}BEGIN:VCARD\nVERSION:4.0\nFN:Bob\nTEL;VALUE=uri:tel:+15550101\nEMAIL:mailto:bob@example.test\nEND:VCARD`
  );
  assert.match(alice.name, /Алиса.*Ли/);
  assert.deepEqual(alice.emails, ['alice@example.test']);
  assert.equal(alice.organization, 'Team; Labs / Research');
  assert.equal(alice.addresses[0].street, 'Main, 1');
  assert.deepEqual(bob.phones, ['+15550101']);
  assert.deepEqual(bob.emails, ['bob@example.test']);
});

test('legacy quoted-printable and UTF-16 exports decode correctly; malformed input is refused', () => {
  const parsed = parseVcard(
    'BEGIN:VCARD\r\nVERSION:2.1\r\nFN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=D0=90=\r\n =D0=BD=D0=BD=D0=B0\r\nEND:VCARD'
  );
  assert.equal(parsed[0].name, 'Анна');
  const bytes = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(card('FN:Zoë'), 'utf16le'),
  ]);
  assert.equal(parseVcard(decodeVcard(bytes))[0].name, 'Zoë');
  assert.throws(() => parseVcard('not a contact export'), /vCard|vcf/);
  assert.throws(
    () => parseVcard('BEGIN:VCARD\nVERSION:3.0\nFN:unfinished'),
    /complete/
  );
  assert.throws(
    () => parseVcard(card().replace('3.0', '9.0')),
    /2.1, 3.0 or 4.0/
  );
});

test('import preview writes nothing; repeated imports update stable contacts without fabricating chats', async () => {
  const store = createMemoryStore();
  const rows = parseVcard(card());
  const plan = await planContactsImport(store, rows, { source: 'vcard' });
  assert.equal(plan.stats.created, 1);
  assert.equal((await store.query()).length, 0);
  assert.equal((await applyContactsImport(store, plan)).imported, 1);
  assert.equal((await applyContactsImport(store, plan)).imported, 0);
  const repeat = await planContactsImport(store, rows, { source: 'vcard' });
  assert.equal(repeat.stats.unchanged, 1);
  assert.equal(repeat.links.length, 0);
  const renamed = await planContactsImport(
    store,
    [{ ...rows[0], name: 'Alice Smith' }],
    { source: 'vcard' }
  );
  assert.equal(renamed.stats.updated, 1);
  await applyContactsImport(store, renamed);
  const [person] = aggregateContacts(await store.query(), { people: true });
  assert.equal(person.name, 'Alice Smith');
  assert.deepEqual(person.emails, ['alice@example.test']);
  assert.equal(person.open, null);
  assert.equal(person.messageCount, 0);
});

test('identical address-book records merge across imports, while names alone do not merge distinct identities', async () => {
  const store = createMemoryStore();
  const row = parseVcard(card())[0];
  await applyContactsImport(
    store,
    await planContactsImport(store, [row, row], { source: 'vcard' })
  );
  const system = await planContactsImport(
    store,
    [{ ...row, uid: 'native-id' }],
    { source: 'system' }
  );
  assert.equal(system.stats.updated, 1);
  await applyContactsImport(store, system);
  const distinct = await planContactsImport(
    store,
    [
      { uid: 'one', name: 'John' },
      { uid: 'two', name: 'John' },
    ],
    { source: 'system' }
  );
  assert.equal(distinct.stats.created, 2);
  await applyContactsImport(store, distinct);
  assert.equal((await store.query()).length, 3);
});

test('the API does not read system contacts on capability checks and binds one-use confirmation to its preview', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-contact-api-'));
  let reads = 0;
  let denied = false;
  const store = createMemoryStore();
  const handle = await startServer({
    store,
    storeDir: dir,
    enableHandlers: false,
    enableSync: false,
    telegramAccount: false,
    systemContactsReader: async () => {
      reads += 1;
      if (denied) {
        throw Object.assign(new Error('Contacts permission denied'), {
          code: 'contacts-permission-denied',
        });
      }
      return [
        { uid: 'local', name: 'Local Person', emails: ['local@example.test'] },
      ];
    },
  });
  const base = `http://127.0.0.1:${handle.port}`;
  const post = async (
    endpoint,
    body,
    origin = 'https://link-foundation.github.io'
  ) => {
    const res = await fetch(`${base}/api/contacts/import/${endpoint}`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  try {
    const sources = await (await fetch(`${base}/api/contacts/import`)).json();
    assert.equal(sources.system.available, true);
    assert.equal(reads, 0);
    assert.equal(
      (await post('preview', { source: 'system' }, 'https://evil.example'))
        .status,
      403
    );
    assert.equal(reads, 0);
    const preview = (await post('preview', { source: 'system' })).body;
    assert.equal(reads, 1);
    assert.equal(
      (await store.query()).filter((l) => l.id.startsWith('person:')).length,
      0
    );
    const request = {
      source: preview.source,
      digest: preview.digest,
      confirmToken: preview.confirm.token,
    };
    assert.equal((await post('apply', request)).body.imported, 1);
    assert.equal((await post('apply', request)).status, 409);
    const replay = (await post('preview', { source: 'vcard', text: card() }))
      .body;
    assert.equal(
      (
        await post('apply', {
          source: 'system',
          digest: replay.digest,
          confirmToken: replay.confirm.token,
        })
      ).status,
      409
    );
    assert.equal(
      (await (await fetch(`${base}/api/status`)).json()).contacts,
      1
    );
    assert.equal(
      (await post('preview', { source: 'vcard', text: 'invalid' })).status,
      400
    );
    const withPhoto = await post('preview', {
      source: 'vcard',
      text: card(
        `FN:Large Export\nPHOTO;ENCODING=b:${'A'.repeat(2 * 1024 * 1024)}`
      ),
    });
    assert.equal(withPhoto.status, 200, 'a valid export can exceed 1 MiB');
    assert.equal(withPhoto.body.created, 1);
    denied = true;
    const refusal = await post('preview', { source: 'system' });
    assert.equal(refusal.status, 403);
    assert.equal(refusal.body.code, 'contacts-permission-denied');
  } finally {
    await handle.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('CLI preview and import share idempotent vCard handling', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-contact-cli-'));
  const file = path.join(dir, 'contacts.vcf');
  const store = path.join(dir, 'store');
  const messages = [];
  const options = { log: (s) => messages.push(s) };
  try {
    await fs.writeFile(file, card());
    const args = ['contacts-import', `--file=${file}`, `--store=${store}`];
    assert.equal(await runCli([...args, '--preview'], options), 0);
    assert.equal(JSON.parse(messages.pop()).created, 1);
    assert.equal(await runCli(args, options), 0);
    assert.equal(JSON.parse(messages.pop()).imported, 1);
    assert.equal(await runCli(args, options), 0);
    assert.equal(JSON.parse(messages.pop()).imported, 0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
