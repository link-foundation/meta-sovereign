import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { planFormAnswers } from '../src/forms/answer-plan.js';
import { extractAnswerProfile } from '../src/automation/question-profile-source.js';
import { createFormsCommands } from '../src/cli/forms-commands.js';
import { startServer } from '../src/server/index.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import {
  formModelField as field,
  formModelInspection as inspection,
} from './helpers/forms-plan-inspection.mjs';
import {
  formPlace,
  cityOffsetLabel,
  seedFormPlace,
} from '../../experiments/issue-56/forms-timezone-fixture.mjs';

const planned = async (labels, input = {}) => {
  const store = createMemoryStore();
  await seedFormPlace(store);
  return planFormAnswers(store, {
    inspection: inspection(labels.map((label) => field(label))),
    profileId: 'qa-profile:form-place',
    ...input,
  });
};

test('combined city and abbreviated time-zone labels retain both configured values', async () => {
  const result = await planned([
    cityOffsetLabel,
    'City and UTC offset',
    'Location and GMT',
    'City and MSK offset',
    'Ваш город и разница с Москвой',
    'City and time zone',
    'शहर और समय क्षेत्र',
    '城市和时区',
  ]);
  for (const { answer } of result.fields) {
    assert.deepEqual(answer.proposal, {
      value: `${formPlace.location}, ${formPlace.timezone}`,
    });
    assert.deepEqual(answer.profileKeys, ['location', 'timezone']);
    assert.equal(answer.source, 'profile');
    assert.equal(answer.requiresReview, true);
  }
});

test('missing requested city or time zone remains unresolved instead of returning a partial contact', async () => {
  for (const key of ['location', 'timezone']) {
    const profile = { ...formPlace, [key]: '' };
    const result = await planned([cityOffsetLabel], { profile });
    const answer = result.fields[0].answer;
    assert.equal(answer.proposal, null);
    assert.deepEqual(answer.missing, [key]);
  }
});

test('separate city and zone controls receive only the value they request', async () => {
  const result = await planned([
    'Город',
    'Time zone',
    'UTC offset',
    'Сколько от МСК?',
  ]);
  assert.deepEqual(
    result.fields.map(({ answer }) => answer.proposal),
    [formPlace.location, ...Array(3).fill(formPlace.timezone)].map((value) => ({
      value,
    }))
  );
});

test('technical, employer and decision questions do not become owner time-zone contacts', async () => {
  const result = await planned([
    'Describe UTC timestamp handling',
    'MSK architecture experience',
    'Company city and UTC offset',
    'Can you work in the MSK time zone?',
    'Какие часовые пояса поддерживает ваша система?',
  ]);
  assert(result.fields.every(({ answer }) => answer.proposal === null));
});

test('explicit time-zone source labels produce reviewable evidence and retain current profile values', async () => {
  for (const label of [
    'Time zone',
    'Timezone',
    'Часовой пояс',
    'समय क्षेत्र',
    '时区',
  ]) {
    const store = createMemoryStore();
    const result = await extractAnswerProfile(store, {
      text: `${label}: ${formPlace.timezone}`,
      profile: { timezone: 'Owner current zone' },
    });
    const zone = result.fields.find((entry) => entry.key === 'timezone');
    assert.equal(zone.current, 'Owner current zone');
    assert.equal(zone.candidates[0].value, formPlace.timezone);
    assert.equal(zone.candidates[0].evidence[0].path, 'line:1');
    assert.equal(zone.conflict, true);
    assert.equal(result.profile.timezone, 'Owner current zone');
    assert.equal(result.requiresReview, true);
    assert.deepEqual(await store.query(), []);
  }
});

test(
  'CLI and both Lino transports use the current named place with explicit override and no browser',
  { timeout: 15000 },
  async () => {
    const store = createMemoryStore();
    await seedFormPlace(store);
    const report = inspection([field(cityOffsetLabel)]);
    const dir = await mkdtemp(join(tmpdir(), 'form-place-'));
    const server = await startServer({
      store,
      port: 0,
      telegramAccount: false,
      enableSync: false,
      enableHandlers: false,
      automations: { scheduler: false },
      forms: {
        reportWriter: null,
        availability: async () => ({ available: false }),
        openSession: () => assert.fail('planning cannot open a browser'),
      },
    });
    try {
      const file = join(dir, 'inspection.json');
      await writeFile(file, JSON.stringify(report));
      const commands = createFormsCommands({
        openStore: async () => store,
        reportWriter: null,
      });
      const output = [];
      await commands['forms-plan'](
        { file, 'profile-id': 'form-place' },
        (text) => output.push(JSON.parse(text))
      );
      assert.equal(
        output[0].fields[0].answer.proposal.value,
        `${formPlace.location}, ${formPlace.timezone}`
      );
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const response = await fetch(
          `http://127.0.0.1:${server.port}/api/forms/plan`,
          {
            method: 'POST',
            headers: { accept: type, 'content-type': type },
            body: encodeWire(
              {
                inspection: report,
                profileId: 'form-place',
                profile: { location: 'Owner override' },
              },
              type
            ),
          }
        );
        assert.equal(response.status, 200);
        const result = await readWireResponse(response);
        assert.equal(
          result.fields[0].answer.proposal.value,
          `Owner override, ${formPlace.timezone}`
        );
      }
    } finally {
      await server.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
);
