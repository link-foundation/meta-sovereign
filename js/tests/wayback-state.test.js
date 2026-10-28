import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Wayback rate limits and malformed responses remain unknown, never proof of no archive', async () => {
  const { waybackState } = await import('../scripts/wayback-state.mjs');
  const response = (data, status = 200) => ({
    ok: status === 200,
    status,
    json: async () => data,
  });
  assert.equal((await waybackState(response({}, 429))).state, 'unknown');
  assert.equal((await waybackState(response({}))).state, 'unknown');
  assert.equal(
    (await waybackState(response({ archived_snapshots: {} }))).state,
    'missing'
  );
  assert.equal(
    (
      await waybackState(
        response({ archived_snapshots: { closest: { available: true } } })
      )
    ).state,
    'unknown'
  );
  assert.deepEqual(
    await waybackState(
      response({
        archived_snapshots: {
          closest: {
            available: true,
            url: 'http://web.archive.org/web/20260101000000/https://example.test',
            timestamp: '20260101000000',
          },
        },
      })
    ),
    {
      state: 'available',
      archiveUrl:
        'https://web.archive.org/web/20260101000000/https://example.test',
      timestamp: '20260101000000',
    }
  );
});
