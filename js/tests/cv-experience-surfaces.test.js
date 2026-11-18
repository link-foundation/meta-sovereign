import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createMemoryStore } from '../src/storage/index.js';
import { startServer } from '../src/server/index.js';
import { createCvCommands } from '../src/cli/cv-commands.js';
import { cvToLink, compareAllCvs } from '../src/cv/index.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import { CvExperienceComparison } from '../src/web/cv-experience-view.js';
import { CvScreen } from '../src/web/cv-view.js';
import { renderInLocale } from './util-render.js';
import { assertStackTable } from './helpers/stack-table.js';
import { experienceEntries } from '../../experiments/issue-56/experience-fixture.mjs';

test('CLI text and JSON expose the stored experience comparison without browser writes', async () => {
  const store = createMemoryStore();
  for (const entry of experienceEntries()) {
    await store.put(cvToLink(entry));
  }
  const before = await store.query();
  const commands = createCvCommands({ openStore: async () => store });
  for (const json of [false, true]) {
    const out = [];
    assert.equal(
      await commands['cv-diff']({ platforms: 'hh,linkedin', json }, (line) =>
        out.push(line)
      ),
      0
    );
    if (json) {
      assert.equal(
        JSON.parse(out.join('\n')).comparison.experience.pairs.length,
        1
      );
    } else {
      assert.match(out.join('\n'), /# HH \/ LinkedIn experience comparison/);
      assert.match(out.join('\n'), /Review linkedin 3: ambiguous/);
    }
  }
  assert.deepEqual(await store.query(), before);
});
test(
  'text and binary Lino comparison retain metadata with no provider or store mutation',
  { timeout: 10000 },
  async () => {
    const store = createMemoryStore();
    const server = await startServer({
      port: 0,
      store,
      enableHandlers: false,
      enableSync: false,
      telegramAccount: false,
      automations: { scheduler: false },
    });
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const response = await fetch(
          `http://127.0.0.1:${server.port}/api/cv/compare`,
          {
            method: 'POST',
            headers: { accept: type, 'content-type': type },
            body: encodeWire(
              { entries: experienceEntries(), experience: { asOf: '2026-11' } },
              type
            ),
          }
        );
        assert.equal(response.status, 200);
        const result = await readWireResponse(response);
        assert.equal(
          result.comparison.experience.pairs[0].left.native.recordId,
          'hh-job-1'
        );
        assert.equal(result.comparison.experience.review.length, 5);
      }
      assert.equal((await store.query()).length, 0);
    } finally {
      await server.close();
    }
  }
);
test('all four locales expose pairs, translation needs, one-sided jobs and unresolved matches', () => {
  const comparison = compareAllCvs(experienceEntries());
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    const html = renderInLocale(
      locale,
      React.createElement(CvExperienceComparison, {
        comparison: comparison.experience,
      })
    );
    assert.match(html, /data-experience-pair="0"/);
    assert.match(html, /data-experience-review="ambiguous"/);
    assert.match(html, /data-experience-review="unknown-period"/);
    assert.match(html, /data-experience-only="HH"/);
    assert.match(html, /data-experience-only="LinkedIn"/);
    assert.match(html, /Software engineer/);
    assert.match(html, /hh-job-1/);
    assert.doesNotMatch(html, /cvExperience\./);
    assert.doesNotMatch(html, /<button/);
    assertStackTable(html, 'cv-experience-comparison');
    const screen = renderInLocale(
      locale,
      React.createElement(CvScreen, {
        state: {
          platforms: [],
          stored: [],
          selected: [],
          busy: '',
          failures: [],
          comparison: { comparison },
          sync: null,
          telemetry: null,
        },
      })
    );
    assert.match(screen, /data-cv-experience="compared"/);
    const error = renderInLocale(
      locale,
      React.createElement(CvExperienceComparison, {
        comparison: { status: 'unavailable' },
      })
    );
    assert.match(error, /role="status"/);
    assert.doesNotMatch(error, /cvExperience\./);
  }
});
