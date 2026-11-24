import { startServer } from '../../js/src/server/index.js';
import { technologyFixture } from './technology-fixture.mjs';
import { linkedinReaderFixture } from './linkedin-experience-fixture.mjs';

export const linkedinExperienceBrowserFixture = async () => {
  const native = await technologyFixture();
  const linkedin = await linkedinReaderFixture();
  let reads = 0;
  try {
    const server = await startServer({
      localUi: true,
      tls: false,
      port: 0,
      store: native.store,
      vacancies: { artifactRoot: native.artifactRoot },
      cv: {
        experience: {
          artifactRoot: linkedin.artifactRoot,
          read: async (options, progress) => {
            reads++;
            if (reads === 2) {
              await progress('waiting-login');
              await new Promise((resolve) =>
                options.signal.addEventListener('abort', resolve, {
                  once: true,
                })
              );
              options.signal.throwIfAborted();
            }
            return linkedin.read(options, progress);
          },
        },
      },
      enableHandlers: false,
      enableSync: false,
      telegramAccount: false,
      automations: { scheduler: false },
    });
    return {
      base: `http://127.0.0.1:${server.port}`,
      close: async () => {
        await server.close();
        await linkedin.close();
        await native.close();
      },
    };
  } catch (error) {
    await linkedin.close();
    await native.close();
    throw error;
  }
};
