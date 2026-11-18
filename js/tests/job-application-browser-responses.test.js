import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { applicationBrowserResponses } from './helpers/application-browser-responses.mjs';
import { encodeWire, LINO_TEXT } from '../src/transport/lino.js';
import {
  applicationFixture,
  applicationInput,
} from '../../experiments/issue-56/application-fixture.mjs';
import { gate } from '../../experiments/issue-56/vacancy-fixture.mjs';

const response = (value, { method = 'POST', body } = {}) => ({
  url: () => 'http://127.0.0.1/api/vacancies/application-continue',
  request: () => ({
    method: () => method,
    headers: () => ({ 'content-type': LINO_TEXT }),
    postDataBuffer: () => Buffer.from(encodeWire(applicationInput)),
  }),
  status: () => 200,
  headers: () => ({ 'content-type': LINO_TEXT }),
  body: body ?? (async () => Buffer.from(encodeWire(value))),
});

test(
  'failure diagnostics validate actual receipts without retaining private bodies',
  { timeout: 3000 },
  async (t) => {
    const fixture = applicationFixture();
    t.after(() => fixture.close());
    const receipt = await fixture.service['application-open']({
      ...applicationInput,
      coverLetter: 'Private owner letter',
    });
    const page = new EventEmitter();
    const trace = applicationBrowserResponses(page);
    page.emit('response', response(receipt, { method: 'GET' }));
    page.emit('response', response(receipt));
    page.emit(
      'response',
      response({ ...receipt, url: 'https://hh.ru/vacancy/999' })
    );
    const rows = await trace.stop();
    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((row) => row.validReceipt),
      [true, false]
    );
    assert.equal(rows[1].validationCode, 'jobs-application-unconfirmed');
    assert.equal(JSON.stringify(rows).includes('Private owner letter'), false);
    assert.equal(
      rows.some((row) => 'report' in row || 'draft' in row),
      false
    );
    assert.equal(page.listenerCount('response'), 0);
  }
);

test(
  'failure diagnostics drain held reads, bound retained rows and detach on Stop',
  { timeout: 3000 },
  async () => {
    const page = new EventEmitter();
    const trace = applicationBrowserResponses(page);
    const held = gate();
    let finished = false;
    for (let index = 0; index < 40; index++) {
      page.emit(
        'response',
        response(null, {
          body: async () => {
            await held.promise;
            return Buffer.from(
              encodeWire({ ok: false, code: `failure-${index}` })
            );
          },
        })
      );
    }
    const stopping = trace.stop().then((rows) => {
      finished = true;
      return rows;
    });
    await Promise.resolve();
    assert.equal(finished, false);
    assert.equal(page.listenerCount('response'), 0);
    held.resolve();
    const rows = await stopping;
    assert.equal(rows.length, 32);
    assert.equal(rows[0].code, 'failure-8');
    assert.equal(rows.at(-1).code, 'failure-39');
  }
);
