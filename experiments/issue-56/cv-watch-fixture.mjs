import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { createVacancyService } from '../../js/src/jobs/service.js';
import { readCvEditorDocument } from '../../js/src/jobs/cv-watch-document.js';

export const cvWatchHash = 'abc123';
export const cvWatchRaw = () => ({
  language: 'en',
  name: 'Example owner',
  title: 'Software engineer',
  skills: ['JavaScript'],
  about: 'Final owner revision',
  jobs: [],
});
export const cvWatchAttempt = () => ({
  kind: 'about',
  hash: cvWatchHash,
  url: `https://hh.ru/resume/edit/${cvWatchHash}/about`,
  about: 'Final owner revision',
});
export const cvWatchFixture = ({ verification = {} } = {}) => {
  const store = createMemoryStore();
  const page = new EventEmitter();
  let receiver;
  let open = false;
  let detached = 0;
  let attached = 0;
  let reads = 0;
  let beforeRead;
  let result = [
    { hash: cvWatchHash, cv: cvWatchRaw(), sha256: 'a'.repeat(64) },
  ];
  page.url = () => cvWatchAttempt().url;
  page.mainFrame = () => page;
  page.evaluate = async () => {};
  page.exposeBinding = async (_binding, receive) => {
    receiver = receive;
  };
  const attach = async () => {
    attached++;
    return {
      page,
      commander: {
        evaluate: async ({ fn }) => {
          if (fn !== readCvEditorDocument) {
            throw new Error('Unexpected browser operation');
          }
          return open ? cvWatchAttempt() : null;
        },
      },
      detach: async () => {
        detached++;
      },
    };
  };
  const options = {
    store,
    availability: async () => ({ available: true }),
    cvWatch: {
      attach,
      verification: { pollMs: 1, verificationMs: 40, ...verification },
      readExports: async () => {
        reads++;
        await beforeRead?.();
        return result;
      },
    },
  };
  const service = createVacancyService(options);
  return {
    store,
    service,
    options,
    page,
    emit: (event, form = cvWatchAttempt(), source = { page, frame: page }) =>
      receiver(source, { event, form }),
    formOpen: (value) => {
      open = value;
    },
    exports: (value) => {
      result = value;
    },
    beforeRead: (value) => {
      beforeRead = value;
    },
    counts: () => ({ attached, detached, reads }),
    async wait(state, requestId) {
      for (let i = 0; i < 200; i++) {
        const result = await service['cv-watch-status']({ requestId });
        if (result.watch?.state === state) {
          return result;
        }
        await delay(5);
      }
      throw new Error(`CV watch never reached ${state}`);
    },
  };
};
