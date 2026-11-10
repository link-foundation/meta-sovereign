import { startServer } from '../../js/src/server/index.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { profileCv } from './question-profile-fixture.mjs';
import { resumeCv } from './resume-profile-fixture.mjs';

const store = createMemoryStore();
await store.put(profileCv);
if (process.env.RESUME_PROFILE_MCP === '1') {
  await store.put(resumeCv);
}
const server = await startServer({
  port: 0,
  store,
  localUi: true,
  telegramAccount: false,
  enableSync: false,
  enableHandlers: false,
  automations: { scheduler: false },
  log: null,
});
console.log(`http://127.0.0.1:${server.port}/#/automation`);
try {
  await new Promise((resolve) => {
    process.stdin.once('data', resolve);
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
} finally {
  if (process.env.RESUME_PROFILE_MCP === '1') {
    console.log(
      JSON.stringify({
        sourceUnchanged:
          JSON.stringify(await store.get(resumeCv.id)) ===
          JSON.stringify(resumeCv),
        savedProfiles: (
          await store.query((entry) => entry.id?.startsWith('qa-profile:'))
        ).length,
      })
    );
  }
  await server.close();
  process.stdin.pause();
}
