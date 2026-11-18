import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applicationDraftControl } from '../../experiments/issue-56/application-draft-mcp-control.mjs';

test('MCP owner evidence recognizes guarded full-form navigation and rejects foreign or ambiguous form URLs', async () => {
  for (const url of [
    'https://hh.ru/applicant/vacancy_response?vacancyId=123&startedWithQuestion=false',
    'https://hh.ru/applicant/vacancy_response?vacancyId=123&vacancyId=124',
    'https://foreign.test/applicant/vacancy_response?vacancyId=123',
    'https://hh.ru/vacancy/124',
  ]) {
    const page = { url: () => url, evaluate: async () => ({ fixture: true }) };
    const browser = { contexts: () => [{ pages: () => [page] }] };
    const read = applicationDraftControl(browser);
    if (url.includes('startedWithQuestion=false')) {
      assert.deepEqual(await read({ url: '/draft-values', method: 'GET' }), {
        fixture: true,
      });
    } else {
      await assert.rejects(
        read({ url: '/draft-values', method: 'GET' }),
        /No bound synthetic application page/
      );
    }
  }
});
