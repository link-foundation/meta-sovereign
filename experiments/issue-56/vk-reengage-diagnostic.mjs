import { reengageServer } from './vk-reengage-fixture.mjs';
import { vkReengageSettings } from '../../js/src/automation/vk-reengage-settings.js';
import { createWirePost } from '../../js/tests/helpers/http-wire.mjs';
import { LINO_BINARY } from '../../js/src/transport/lino.js';
const fixture = await reengageServer();
try {
  await vkReengageSettings.music.save(fixture.store, {
    ...(await vkReengageSettings.music.settings(fixture.store)),
    audio: 'audio-1_23',
  });
  const post = createWirePost(fixture.base, '/api/vk/music', LINO_BINARY);
  const { plan } = (await post('/plan', {})).answer;
  const result = await post('/run', { planId: plan.planId, confirm: true });
  console.log(
    JSON.stringify(
      {
        result,
        effects: fixture.effects,
        records: await fixture.store.query(
          (r) =>
            r.id.startsWith('provider-reengage:') ||
            r.id.startsWith('outbox:vk-music:')
        ),
      },
      null,
      2
    )
  );
} finally {
  await fixture.close();
}
