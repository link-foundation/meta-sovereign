import { startServer } from '../../src/server/index.js';

/** Disposable question fixtures use an isolated port with live services disabled. */
export const startQuestionFixtureServer = (
  { store, send, runner, readVacancy, forms },
  localUi = false
) =>
  startServer({
    store,
    port: 0,
    localUi,
    enableSync: false,
    enableHandlers: false,
    telegramAccount: false,
    forms,
    automations: { scheduler: false, send, modelRunner: runner, readVacancy },
    log: null,
  });
