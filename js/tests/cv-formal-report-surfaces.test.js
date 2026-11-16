import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { setTimeout as delay } from 'node:timers/promises';
import {
  startCvFixtureServer,
  cvFixtureRequest,
} from '../../experiments/issue-56/cv-fixture-server.mjs';
import { createCvCommands } from '../src/cli/cv-commands.js';
import { parseArgs } from '../src/cli/lino-args.js';
import { createExperienceApi } from '../src/web/cv-experience-api.js';
import {
  createFormalReportState,
  CvFormalReportScreen,
} from '../src/web/cv-formal-report.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { renderInLocale } from './util-render.js';
import { CvExperiencePlanView } from '../src/web/cv-experience-plan-view.js';
import {
  formalReportFixture,
  settledFormalReport,
} from '../../experiments/issue-56/formal-report-fixture.mjs';

test(
  'reviewed reports expose protected Start/Stop and read-only recovery in both Lino encodings',
  { timeout: 10000 },
  async () => {
    const fixture = await formalReportFixture();
    const server = await startCvFixtureServer({
      store: fixture.store,
      cv: { formalReports: { github: fixture.github } },
    });
    const base = `http://127.0.0.1:${server.port}/api/cv/experience/report-`;
    const request = cvFixtureRequest(base, ['preview', 'status']);
    try {
      for (const [index, type] of [LINO_TEXT, LINO_BINARY].entries()) {
        const input = fixture.input(`report-http-${index}`);
        const preview = await request('preview', type, {
          planRequestId: input.planRequestId,
        });
        assert.equal(preview.row.fingerprint, fixture.preview.fingerprint);
        assert.equal(
          preview.response.headers.get('cache-control'),
          'private, no-store'
        );
        assert.equal(
          (await request('start', type, input, 'https://untrusted.example'))
            .response.status,
          403
        );
        assert.equal(
          (await request('start', type, input)).response.status,
          200
        );
        const row = await settledFormalReport(
          {
            status: async (value) => (await request('status', type, value)).row,
          },
          input.requestId
        );
        const status = await request('status', type, {
          requestId: input.requestId,
        });
        assert.equal(status.row.fingerprint, row.fingerprint);
        assert.equal(
          status.response.headers.get('content-type').split(';')[0],
          type
        );
        assert.equal(
          (await request('stop', type, input, 'https://untrusted.example'))
            .response.status,
          403
        );
        assert.equal(
          (await request('stop', type, input)).row.phase,
          'completed'
        );
        assert.equal((await fetch(`${base}start`)).status, 405);
      }
      assert.equal(
        fixture.calls.some((call) => call.operation === 'write'),
        false
      );
    } finally {
      await server.close();
      await fixture.close();
    }
  }
);

test(
  'CLI preview/status open read-only, explicit flags override publication and foreground completion drains before close',
  { timeout: 10000 },
  async () => {
    for (const [flag, mode] of [
      ['dry-run-issues', 'dry-run'],
      ['no-report-formal-ai', 'off'],
    ]) {
      const fixture = await formalReportFixture();
      const opened = [];
      const commands = createCvCommands({
        openStore: async () => {
          opened.push('write');
          return fixture.store;
        },
        openReadOnly: async () => {
          opened.push('read');
          return fixture.store;
        },
        live: {
          formalReports: { github: fixture.github, wait: () => delay(1) },
        },
      });
      try {
        const input = fixture.input(`cli-${flag}`);
        const args = parseArgs([
          '--request-id',
          input.requestId,
          '--plan-request-id',
          input.planRequestId,
          '--review',
          input.review,
          '--mode',
          'publish',
          '--confirm',
          `--${flag}`,
        ]);
        const output = [];
        for (const operation of ['preview', 'start', 'status']) {
          assert.equal(
            await commands[`cv-experience-report-${operation}`](args, (text) =>
              output.push(JSON.parse(text))
            ),
            0
          );
        }
        assert.deepEqual(opened, ['read', 'write', 'read']);
        assert.equal(output[1].options.mode, mode);
        assert.equal(output[1].phase, 'completed');
        assert.deepEqual(output[1], output[2]);
        assert.equal(
          fixture.calls.some((call) => call.operation === 'write'),
          false
        );
        if (mode === 'off') {
          assert.equal(fixture.calls.length, 0);
        }
      } finally {
        await fixture.close();
      }
    }
  }
);

test(
  'lost browser Start acknowledgement recovers by status without replay; localized controls require publication consent',
  { timeout: 10000 },
  async () => {
    const fixture = await formalReportFixture();
    let starts = 0;
    let scheduled;
    const state = createFormalReportState(
      {
        cvFormalReportStart: async (input) => {
          starts++;
          await fixture.reports.start(input);
          throw new Error('Synthetic lost response');
        },
        cvFormalReportStatus: (input) => fixture.reports.status(input),
        cvFormalReportStop: (input) => fixture.reports.stop(input),
      },
      () => {},
      {
        uuid: () => 'report-browser',
        schedule: (work) => {
          scheduled = work;
        },
        cancel: () => {},
      }
    );
    try {
      assert.equal(
        await state.mutate('Start', fixture.input('report-browser')),
        false
      );
      assert.equal(state.state.unknown, true);
      await settledFormalReport(fixture.reports, 'report-browser');
      await scheduled();
      assert.equal(state.state.row.phase, 'completed');
      assert.equal(starts, 1);
      assert.equal(
        await state.mutate('Start', fixture.input('report-browser')),
        false
      );
      state.newRequest();
      state.input('mode', 'publish');
      for (const locale of ['en', 'ru', 'hi', 'zh']) {
        const html = renderInLocale(
          locale,
          React.createElement(CvFormalReportScreen, {
            state: state.state,
            actions: state,
            preview: fixture.preview,
          })
        );
        assert.match(html, /data-formal-report-confirm="true"/u);
        assert.match(html, /disabled="" data-formal-report-action="start"/u);
        assert.doesNotMatch(html, /formalReport\./u);
        const plan = renderInLocale(
          locale,
          React.createElement(CvExperiencePlanView, { row: fixture.plan })
        );
        assert.doesNotMatch(plan, /cvExperience\./u);
      }
    } finally {
      state.dispose();
      await fixture.close();
    }
  }
);

test('report API client refuses absent/negative acknowledgements and uses GET only for previews and status', async () => {
  const calls = [];
  const api = createExperienceApi({
    get: async (url) => {
      calls.push(url);
      return undefined;
    },
    report: async () => ({ ok: false, httpStatus: 503 }),
  });
  await assert.rejects(api.cvFormalReportPreview({ planRequestId: 'plan' }));
  await assert.rejects(api.cvFormalReportStatus({ requestId: 'request' }));
  await assert.rejects(api.cvFormalReportStart({ requestId: 'request' }));
  await assert.rejects(api.cvFormalReportStop({ requestId: 'request' }));
  assert.deepEqual(calls, [
    '/api/cv/experience/report-preview?planRequestId=plan',
    '/api/cv/experience/report-status?requestId=request',
  ]);
});
