import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createVacancyService } from '../src/jobs/service.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { LINO_BINARY, LINO_TEXT } from '../src/transport/lino.js';
import {
  applicationFixture,
  applicationInput,
} from '../../experiments/issue-56/application-fixture.mjs';
import {
  assertApplicationPanelLocales,
  successfulApplicationFixtureCommand,
  withApplicationRouteFixture,
} from './helpers/application-controls.mjs';

const letter = 'Reviewed separate cover letter';
const advance = (service, receipt, action, confirm = true) =>
  service['application-advance']({
    ...applicationInput,
    revision: receipt.revision,
    action,
    confirm,
  });
const removePopup = async (page) => {
  page.attachment = { offer: null, submit: null, value: null };
};
const attachmentFixture = (t, send = removePopup, store) => {
  const clicks = [];
  const offer = { disabled: false };
  const submit = { disabled: false };
  const fixture = applicationFixture({
    store,
    application: {
      dispatch: async (_handle, _record, action) => {
        clicks.push(action);
        if (action === 'attachmentOpen') {
          fixture.state.page.attachment = {
            offer: null,
            submit,
            value: '',
          };
        } else {
          const dispatched = await send(fixture.state.page);
          if (dispatched === false) {
            return { dispatched };
          }
        }
        return { dispatched: true };
      },
      writeLetter: async (_browser, text) => {
        fixture.state.page.attachment.value = text;
        return 'verified';
      },
    },
  });
  t.after(() => fixture.close());
  Object.assign(fixture.state.page, {
    delivered: true,
    attachment: { offer, submit: null, value: null },
  });
  return { ...fixture, clicks };
};
const open = (service, options = {}) =>
  service['application-open']({
    ...applicationInput,
    coverLetter: letter,
    ...options,
  });
const refusal = (code) => ({ code: `jobs-application-${code}` });

test(
  'delivered vacancy opens, fills, and separately attaches a cover letter',
  { timeout: 3000 },
  async (t) => {
    const { service, clicks } = attachmentFixture(t);
    const delivered = await open(service);
    assert.equal(delivered.delivery, 'provider-confirmed');
    assert.equal(delivered.letterAttachment, 'offered');
    assert.equal(Object.hasOwn(delivered.page, 'attachment'), false);
    await assert.rejects(
      advance(service, delivered, 'letter-prepare', false),
      refusal('confirmation')
    );
    await assert.rejects(
      advance(service, delivered, 'letter-send'),
      refusal('state')
    );
    const ready = await advance(service, delivered, 'letter-prepare');
    assert.equal(ready.letterAttachment, 'ready');
    assert.deepEqual(clicks, ['attachmentOpen']);
    assert.equal(JSON.stringify(ready).includes(letter), false);
    const sent = await advance(service, ready, 'letter-send');
    assert.equal(sent.letterAttachment, 'provider-confirmed');
    assert.equal(sent.delivery, 'provider-confirmed');
    assert.deepEqual(clicks, ['attachmentOpen', 'attachmentSend']);
    await assert.rejects(
      advance(service, sent, 'letter-send'),
      refusal('already-attempted')
    );
  }
);

test(
  'an offered attachment can reopen read-only after the service closes',
  { timeout: 3000 },
  async (t) => {
    const fixture = attachmentFixture(t);
    const offered = await open(fixture.service);
    assert.equal(offered.letterAttachment, 'offered');
    await fixture.service.stop();
    const recovered = createVacancyService(fixture.serviceOptions);
    t.after(() => recovered.stop());
    const status = await recovered['application-status'](applicationInput);
    assert.equal(status.letterAttachment, 'needs-review');
    const reopened = await open(recovered, { recover: true });
    assert.equal(reopened.letterAttachment, 'offered');
    assert.deepEqual(fixture.clicks, []);
  }
);

test(
  'lost attachment dispatch stays unknown and cannot replay across restart',
  { timeout: 3000 },
  async (t) => {
    const fixture = attachmentFixture(t, async () => {
      throw new Error('Synthetic lost browser receipt');
    });
    const ready = await advance(
      fixture.service,
      await open(fixture.service),
      'letter-prepare'
    );
    await assert.rejects(
      advance(fixture.service, ready, 'letter-send'),
      /Synthetic lost browser receipt/u
    );
    await fixture.service.stop();
    const restarted = createVacancyService(fixture.serviceOptions);
    t.after(() => restarted.stop());
    const status = await restarted['application-status'](applicationInput);
    assert.equal(status.delivery, 'provider-confirmed');
    assert.equal(status.letterAttachment, 'unknown');
    const recovered = await open(restarted, { recover: true });
    await assert.rejects(
      advance(restarted, recovered, 'letter-send'),
      refusal('already-attempted')
    );
    assert.deepEqual(fixture.clicks, ['attachmentOpen', 'attachmentSend']);
  }
);

test(
  'test mode and changed owner letters make zero attachment clicks',
  { timeout: 3000 },
  async (t) => {
    const preview = attachmentFixture(t, async () => {});
    const active = await open(preview.service, { testMode: true });
    assert.equal(
      (await advance(preview.service, active, 'letter-prepare')).state,
      'test-preview'
    );
    assert.deepEqual(preview.clicks, []);

    const owner = attachmentFixture(t, async () => {});
    const ready = await advance(
      owner.service,
      await open(owner.service),
      'letter-prepare'
    );
    owner.state.page.attachment.value = 'Owner native edit';
    await assert.rejects(
      advance(owner.service, ready, 'letter-send'),
      refusal('changed')
    );
    assert.equal(owner.state.page.attachment.value, 'Owner native edit');
    assert.deepEqual(owner.clicks, ['attachmentOpen']);
  }
);

test(
  'unknown outcomes stay reserved when the popup disappears by navigation',
  { timeout: 3000 },
  async (t) => {
    const { service, clicks } = attachmentFixture(t, async (page) => {
      await removePopup(page);
      page.documentKey = 'different-document';
    });
    const ready = await advance(service, await open(service), 'letter-prepare');
    const sent = await advance(service, ready, 'letter-send');
    assert.equal(sent.delivery, 'provider-confirmed');
    assert.equal(sent.letterAttachment, 'unknown');
    await assert.rejects(
      advance(service, sent, 'letter-send'),
      refusal('already-attempted')
    );
    assert.deepEqual(clicks, ['attachmentOpen', 'attachmentSend']);
  }
);

test(
  'a definite browser refusal releases only the cover-letter reservation',
  { timeout: 3000 },
  async (t) => {
    let dispatched = false;
    const { service } = attachmentFixture(t, async (page) => {
      if (!dispatched) {
        dispatched = true;
        return false;
      }
      return removePopup(page);
    });
    const ready = await advance(service, await open(service), 'letter-prepare');
    await assert.rejects(
      advance(service, ready, 'letter-send'),
      refusal('unconfirmed')
    );
    const current = await service['application-status'](applicationInput);
    assert.equal(current.delivery, 'provider-confirmed');
    assert.equal(current.letterAttachment, 'ready');
    const sent = await advance(service, current, 'letter-send');
    assert.equal(sent.letterAttachment, 'provider-confirmed');
  }
);

for (const phase of ['unknown', 'provider-confirmed']) {
  test(
    `failed ${phase} attachment checkpoint retains the last acknowledgement`,
    { timeout: 3000 },
    async (t) => {
      const memory = createMemoryStore();
      let refused = false;
      const store = {
        ...memory,
        put: async (row) => {
          await memory.put(row);
          if (!refused && row.attachmentDelivery === phase) {
            refused = true;
            throw new Error('Fixture checkpoint refused');
          }
        },
      };
      const { service, clicks } = attachmentFixture(t, removePopup, store);
      const ready = await advance(
        service,
        await open(service),
        'letter-prepare'
      );
      await assert.rejects(
        advance(service, ready, 'letter-send'),
        /Fixture checkpoint refused/u
      );
      const status = await service['application-status'](applicationInput);
      assert.equal(status.delivery, 'provider-confirmed');
      if (phase === 'unknown') {
        assert.equal(status.letterAttachment, 'ready');
        assert.deepEqual(clicks, ['attachmentOpen']);
      } else {
        assert.equal(status.letterAttachment, 'unknown');
        assert.deepEqual(clicks, ['attachmentOpen', 'attachmentSend']);
      }
    }
  );
}

for (const format of [LINO_TEXT, LINO_BINARY]) {
  test(
    `the separate letter keeps current confirmation through ${format}`,
    { timeout: 5000 },
    async (t) => {
      const fixture = attachmentFixture(t);
      await withApplicationRouteFixture(fixture, format, async (api) => {
        const delivered = await api.vacancyApplicationOpen({
          ...applicationInput,
          coverLetter: letter,
        });
        const prepare = await api.vacancyApplicationAdvance({
          ...applicationInput,
          revision: delivered.revision,
          action: 'letter-prepare',
          confirm: true,
        });
        assert.equal(prepare.letterAttachment, 'ready');
        assertApplicationPanelLocales(prepare, [
          'attachment.ready',
          'attachment.letter-send',
        ]);
        const attached = await api.vacancyApplicationAdvance({
          ...applicationInput,
          revision: prepare.revision,
          action: 'letter-send',
          confirm: true,
        });
        assert.equal(attached.letterAttachment, 'provider-confirmed');
        assertApplicationPanelLocales(attached, [
          'attachment.provider-confirmed',
        ]);
      });
      assert.deepEqual(fixture.clicks, ['attachmentOpen', 'attachmentSend']);
    }
  );
}

test(
  'supervised CLI keeps the offer open for independent prepare and send commands',
  { timeout: 5000 },
  async (t) => {
    const fixture = attachmentFixture(t);
    const directory = await mkdtemp(
      join(tmpdir(), 'application-letter-fixture-')
    );
    t.after(() => rm(directory, { recursive: true, force: true }));
    const file = join(directory, 'letter.txt');
    await writeFile(file, letter);
    const output = await successfulApplicationFixtureCommand(
      fixture,
      () => Readable.from(['status', 'letter-prepare', 'letter-send', 'quit']),
      { 'cover-letter-file': file, supervised: true }
    );
    assert.equal(output[0].letterAttachment, 'offered');
    assert.equal(
      output.filter((row) => row.letterAttachment === 'ready').length,
      1
    );
    assert.equal(output.at(-1).letterAttachment, 'provider-confirmed');
    assert.deepEqual(fixture.clicks, ['attachmentOpen', 'attachmentSend']);
  }
);
