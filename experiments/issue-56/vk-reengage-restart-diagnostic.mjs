import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLinoTextStore } from '../../js/src/storage/lino-store.js';
import { withCausalWrites } from '../../js/src/storage/causal-writes.js';
import {
  reengageAdapter,
  reengageJob,
  runReengage,
} from './vk-reengage-fixture.mjs';
import {
  vkReengageSettings,
  reengageLedgerId,
} from '../../js/src/automation/vk-reengage-settings.js';
import { cancelledNow } from './vk-cancelled-fixture.mjs';
import {
  priorConversation,
  evidenceHash,
} from '../../js/src/automation/vk-reengage-evidence.js';
const directory = await mkdtemp(join(tmpdir(), 'vk-restart-diagnostic-'));
let store;
let job;
try {
  store = withCausalWrites(
    await createLinoTextStore(join(directory, 'state.lino'))
  );
  const adapter = reengageAdapter({
    response: (_effect, number) => (number === 2 ? 'refused' : 'confirmed'),
  });
  await vkReengageSettings.music.save(store, {
    ...(await vkReengageSettings.music.settings(store)),
    enabled: true,
    audio: 'audio-1_23',
  });
  job = reengageJob('music', store, adapter);
  console.log('first', JSON.stringify(await runReengage(job)));
  await job.stop();
  await store.close();
  store = withCausalWrites(
    await createLinoTextStore(join(directory, 'state.lino'))
  );
  job = reengageJob('music', store, adapter, {
    now: () => cancelledNow + 1200000,
  });
  console.log('scheduled', JSON.stringify(await job.run({ scheduled: true })));
  const review = await job.preview();
  console.log('review', JSON.stringify(review));
  console.log(
    'journal',
    JSON.stringify(await store.get(reengageLedgerId('music', 1, 9)))
  );
  const state = await adapter.live.reengageState(9, {
    token: 'fixture-user-token',
    ...review.settings,
  });
  const prior = priorConversation(state, review.plan.items[0].steps);
  console.log('prior', JSON.stringify(prior), await evidenceHash(prior));
  console.log(
    'result',
    JSON.stringify(await job.run({ planId: review.plan.planId, confirm: true }))
  );
  console.log('effects', JSON.stringify(adapter.effects));
} finally {
  await job?.stop();
  await store?.close();
  await rm(directory, { recursive: true, force: true });
}
