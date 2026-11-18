import { startServer } from '../../src/server/index.js';

/** Disposable question fixtures use an isolated port with live services disabled. */
export const startQuestionFixtureServer = (
  { store, send, runner, readVacancy },
  localUi = false
) =>
  startServer({
    store,
    port: 0,
    localUi,
    enableSync: false,
    enableHandlers: false,
    telegramAccount: false,
    automations: { scheduler: false, send, modelRunner: runner, readVacancy },
    log: null,
  });
