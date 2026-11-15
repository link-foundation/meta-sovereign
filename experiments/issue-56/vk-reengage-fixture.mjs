import { greetAdapter } from './vk-greet-fixture.mjs';
import {
  personalFixtureOptions,
  cancelledNow,
} from './vk-cancelled-fixture.mjs';
import { createVkReengageJob } from '../../js/src/automation/vk-reengage.js';
import {
  reengageKinds,
  vkReengageSettings,
} from '../../js/src/automation/vk-reengage-settings.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { friendsServer } from './vk-friends-fixture.mjs';

export const reengageAdapter = (options = {}) => {
  let mode = 'confirmed';
  const effects = [];
  const adapter = greetAdapter({
    ids: [9],
    ...options,
    methods: {
      'messages.send': (params) => {
        const effect = {
          peer: Number(params.peer_id),
          text: params.message ?? '',
          audio: params.attachment ?? null,
          sticker: Number(params.sticker_id ?? 0),
          randomId: params.random_id,
        };
        effects.push(effect);
        const response = options.response?.(effect, effects.length) ?? mode;
        if (response === 'unknown') {
          throw new Error('Fixture ordered response lost');
        }
        if (response === 'refused') {
          return {
            error: { error_code: 29, error_msg: 'Fixture ordered refusal' },
          };
        }
        if (response === 'unconfirmed') {
          return 0;
        }
        const attachments = effect.sticker
          ? [{ type: 'sticker', sticker: { sticker_id: effect.sticker } }]
          : effect.audio
            ? effect.audio.split(',').map((value) => {
                const [, type, owner, id] =
                  /^(photo|audio|video|doc)(-?\d+)_(\d+)/u.exec(value);
                return {
                  type,
                  [type]: { owner_id: Number(owner), id: Number(id) },
                };
              })
            : [];
        return adapter.addMessage(effect.peer, effect.text, { attachments }).id;
      },
      ...options.methods,
    },
  });
  for (const id of adapter.ids) {
    adapter.addMessage(id, 'Earlier conversation', {
      out: 0,
      date: Math.floor(cancelledNow / 1000) - 40 * 86400,
    });
  }
  return {
    ...adapter,
    effects,
    mode: (value) => {
      mode = value;
    },
  };
};
export const reengageJob = (kind, store, adapter, options = {}) =>
  createVkReengageJob({
    kind,
    store,
    ...personalFixtureOptions(adapter, options),
  });
export const withReengageJob = async (
  kind,
  check,
  {
    adapter = reengageAdapter(),
    settings = {},
    store = createMemoryStore(),
    ...options
  } = {}
) => {
  const policy = vkReengageSettings[kind];
  await policy.save(store, {
    ...(await policy.settings(store)),
    ...(kind === 'music' ? { audio: 'audio-1_23' } : {}),
    ...settings,
  });
  const job = reengageJob(kind, store, adapter, options);
  try {
    return await check({ store, adapter, job, policy });
  } finally {
    await job.stop();
  }
};
export const reengageServer = async (options = {}) => {
  const adapter = options.adapter ?? reengageAdapter();
  return friendsServer({
    ...options,
    adapter,
    vkReengage: Object.fromEntries(
      reengageKinds.map((kind) => [
        kind,
        personalFixtureOptions(adapter, options.vkReengage?.[kind]),
      ])
    ),
  });
};
export const runReengage = async (job) => {
  const { plan } = await job.preview();
  return job.run({ planId: plan.planId, confirm: true });
};
