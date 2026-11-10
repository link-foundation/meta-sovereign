import {
  telegramBacklinksFixture,
  telegramBacklinkInput,
} from '../../js/tests/helpers/telegram-backlinks.mjs';
const f = await telegramBacklinksFixture();
try {
  const adapter = f.actions.followBacklinkAdapter();
  console.log('target', await adapter.describe('-7'));
  try {
    console.log(
      'post',
      await adapter.post({
        chat: '-7',
        backlink: telegramBacklinkInput().backlink,
        key: 'fixture-stable',
      })
    );
  } catch (error) {
    console.log(error.stack);
  }
  console.log(
    'methods',
    f.requests.map((r) => r.className)
  );
} finally {
  await f.close();
}
