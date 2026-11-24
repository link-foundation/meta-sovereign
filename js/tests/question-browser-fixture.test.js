import test from 'node:test';
import assert from 'node:assert/strict';
import { questionBrowserControlServer } from '../../experiments/issue-56/question-browser-control.mjs';

test(
  'private browser fixture control errors are inert plain text without reflecting exception markup',
  { timeout: 5000 },
  async () => {
    const server = questionBrowserControlServer({
      reset: async () => {
        throw new Error(
          '<script>document.body.textContent="untrusted"</script>'
        );
      },
      stats: async () => ({ clicks: 0 }),
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const failed = await fetch(`${base}/reset`);
      assert.equal(failed.status, 500);
      assert.equal(
        failed.headers.get('content-type'),
        'text/plain; charset=utf-8'
      );
      assert.equal(await failed.text(), 'Fixture request failed.');
      const good = await fetch(`${base}/stats`);
      assert.equal(good.status, 200);
      assert.equal(good.headers.get('content-type'), 'application/json');
      assert.deepEqual(await good.json(), { clicks: 0 });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }
);
