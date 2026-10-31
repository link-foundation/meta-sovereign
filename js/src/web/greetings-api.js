import {
  greetingCatalogue,
  loadGreetingSelection,
  planFromStore,
  saveGreetingSelection,
} from '../greetings/plan.js';
import { scopedUrl } from './telegram-account-scope.js';
/**
 * Offline answer for the greeting calls that need a network adapter:
 * listing stickers live and sending a queued plan (issue #35).
 */
const greetingsOffline = (networks) => ({
  network: (networks ?? []).join(',') || 'all',
  error: 'server-required',
});

export const createGreetingApi = ({
  ensure,
  serverFetch,
  postJson,
  serverPostConfirmed,
}) => ({
  // Greetings (issue #35). The catalogue, the selection and the plan
  // preview work from the browser store when no server answers; live
  // sticker lists, sends and Telegram thumbnails need the server,
  // which holds the tokens.
  greetingCatalogue: async () =>
    (await serverFetch('/api/greetings/catalogue')) ?? greetingCatalogue(),
  greetingSelection: async () =>
    (await serverFetch('/api/greetings/selection')) ??
    loadGreetingSelection((await ensure()).store),
  saveGreetingSelection: async (selection) =>
    (await serverFetch('/api/greetings/selection', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(selection),
    })) ?? saveGreetingSelection((await ensure()).store, selection),
  greetingStickers: async (networks) =>
    (await postJson('/api/greetings/stickers', { networks })) ?? {
      stickers: [],
      failures: [greetingsOffline(networks)],
    },
  // `run: 'queue'` sends: `ask(answer)` confirms the plan in
  // `answer.preview`, and exactly that plan is sent.
  greetingPlan: async ({ ask, ...options } = {}) => {
    const answer =
      options.run === 'queue'
        ? await serverPostConfirmed('/api/greetings/plan', options, ask)
        : await postJson('/api/greetings/plan', options);
    if (answer) {
      return answer;
    }
    if (options.run === 'queue') {
      return {
        plan: null,
        results: [],
        failures: [greetingsOffline(options.networks)],
      };
    }
    return planFromStore((await ensure()).store, options);
  },
  /** Proxy URL for a Telegram thumbnail, or null without a server. */
  greetingFileUrl: async (fileId) => {
    const { client, origin } = await ensure();
    if (!fileId || !client.isOnline()) {
      return null;
    }
    const path = `/api/greetings/file?id=${encodeURIComponent(fileId)}`;
    return scopedUrl(origin ? new URL(path, origin).toString() : path);
  },
});
