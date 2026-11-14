import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { cvTranslationFixture } from '../../experiments/issue-56/cv-translation-fixture.mjs';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import { LINO_TEXT, LINO_BINARY, decodeWire } from '../src/transport/lino.js';
import { createVacancyCommands } from '../src/cli/vacancy-commands.js';
import { CvTranslationPanel } from '../src/web/cv-translation-panel.js';
import { renderInLocale } from './util-render.js';
import { translate } from '../src/web/i18n.js';

test('text and binary Lino share comparison, GET recovery, cancellation and trusted-origin guards', async () => {
  const f = cvTranslationFixture();
  try {
    await withRoutes(
      async (base) => {
        for (const type of [LINO_TEXT, LINO_BINARY]) {
          const input = { ...f.input, requestId: randomUUID() };
          const result = await wirePost(base, 'cv-translate', input, type);
          assert.equal(result.status, 200);
          assert.equal(result.value.comparison.rows[0].chosenBy, 'haiku');
          const count = f.calls.translate.length;
          const response = await fetch(
            `${base}/api/vacancies/cv-translation-status?browserSlot=jobs&requestId=${input.requestId}`,
            { headers: { accept: type } }
          );
          const recovered = decodeWire(
            await response.arrayBuffer(),
            response.headers.get('content-type')
          );
          assert.equal(
            recovered.comparison.fingerprint,
            result.value.comparison.fingerprint
          );
          assert.equal(f.calls.translate.length, count);
          const cancelled = await wirePost(
            base,
            'cv-translation-cancel',
            { requestId: randomUUID(), browserSlot: 'jobs' },
            type
          );
          assert.equal(cancelled.status, 200);
          assert(cancelled.value.cancelled);
          assert.equal(
            (
              await wirePost(base, 'cv-translate', input, type, {
                origin: 'https://foreign.invalid',
              })
            ).status,
            403
          );
        }
      },
      { store: f.store, service: { cvTranslation: { adapters: f.adapters } } }
    );
  } finally {
    await f.service.stop();
  }
});

test('CLI accepts the bounded explicit text file and returns the same private receipt and read-only recovery', async () => {
  const f = cvTranslationFixture();
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'cv-translation-cli-')
  );
  const filename = path.join(directory, 'texts.json');
  await writeFile(filename, JSON.stringify({ texts: f.input.texts }));
  const commands = createVacancyCommands({
    openStore: async () => f.store,
    cvTranslation: { adapters: f.adapters },
  });
  const lines = [];
  const log = (line) => lines.push(line);
  try {
    assert.equal(
      await commands['vacancies-cv-translate'](
        {
          file: filename,
          from: 'ru',
          to: 'en',
          'request-id': f.input.requestId,
        },
        log
      ),
      0
    );
    const comparison = decodeWire(lines.at(-1), LINO_TEXT).comparison;
    assert.equal(comparison.input.requestId, f.input.requestId);
    assert.equal(comparison.providerSaved, false);
    const count = f.calls.translate.length;
    assert.equal(
      await commands['vacancies-cv-translation-status'](
        { 'request-id': f.input.requestId },
        log
      ),
      0
    );
    assert.equal(f.calls.translate.length, count);
    assert.equal(
      decodeWire(lines.at(-1), LINO_TEXT).comparison.fingerprint,
      comparison.fingerprint
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
    await f.service.stop();
  }
});

test('four locales expose side-by-side variants, provenance, explicit admission and truthful provider state', async () => {
  const f = cvTranslationFixture();
  try {
    const { comparison } = await f.service['cv-translate'](f.input);
    for (const locale of ['en', 'ru', 'zh', 'hi']) {
      const markup = renderInLocale(
        locale,
        React.createElement(CvTranslationPanel, {
          state: {
            capabilities: { cvTranslation: true },
            cvTranslation: { comparison, pending: '', loadError: false },
          },
          t: (key) => translate(locale, key),
        })
      );
      assert(markup.includes('data-cv-translation-variant="haiku"'));
      assert(markup.includes('data-cv-translation-action="reload"'));
      assert(markup.includes('claude-haiku-5-5'));
      assert(markup.includes('placeholder'));
      assert(!markup.includes('cvTranslation.'));
    }
  } finally {
    await f.service.stop();
  }
});
