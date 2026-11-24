import { setTimeout as delay } from 'node:timers/promises';
import { startCvFixtureServer } from './cv-fixture-server.mjs';
import { linkedinPositionReviewFixture } from './linkedin-position-review-fixture.mjs';

export const linkedinPositionReviewBrowserFixture = async () => {
  const fixture = await linkedinPositionReviewFixture();
  const counters = { opened: 0, saved: 0, cancelled: 0, detached: 0 };
  const open = async (plan, signal, withPrepared) => {
    counters.opened++;
    let phase = 'open';
    const check = () => signal.throwIfAborted();
    const session = { page: { evaluate: async () => phase } };
    const form = {
      read: async ({ action }) => {
        if (action.kind === 'save') {
          counters.saved++;
        } else {
          counters.cancelled++;
        }
        phase = 'closed';
        return { state: 'dispatched' };
      },
    };
    try {
      return await withPrepared({
        session,
        form,
        signal,
        check,
        now: Date.now,
        wait: (_ms, signal) => delay(20, undefined, { signal }),
        skills: {
          applied: plan.skills,
          unapplied: [],
          confirm: async () => {},
        },
        media: {
          applied: plan.media,
          unresolved: false,
          confirm: async () => {},
        },
      });
    } finally {
      counters.detached++;
    }
  };
  try {
    const server = await startCvFixtureServer({
      localUi: true,
      store: fixture.store,
      cv: {
        experience: { artifactRoot: fixture.artifactRoot, position: { open } },
      },
    });
    return {
      base: `http://127.0.0.1:${server.port}`,
      planRequestId: fixture.row.requestId,
      counters,
      close: async () => {
        await server.close();
        await fixture.close();
      },
    };
  } catch (error) {
    await fixture.close();
    throw error;
  }
};
