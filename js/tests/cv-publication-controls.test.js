import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {
  createVacancyCommands,
  VACANCY_HELP,
} from '../src/cli/vacancy-commands.js';
import { createVacancyApi } from '../src/web/vacancy-api.js';
import { CvSnapshotPublication } from '../src/web/cv-publication-panel.js';
import { translate } from '../src/web/i18n.js';
import { renderInLocale } from './util-render.js';
import { decodeWire, LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import { cvPublicationFixture } from '../../experiments/issue-56/cv-publication-fixture.mjs';

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `saved snapshot publication requires trusted confirmation and read-only recovery in ${type}`,
    { timeout: 20000 },
    async () => {
      const f = await cvPublicationFixture();
      try {
        await withRoutes(
          async (base) => {
            assert.equal(
              (
                await wirePost(base, 'cv-publish-plan', f.input, type, {
                  origin: 'https://untrusted.test',
                })
              ).status,
              403
            );
            const plan = await wirePost(base, 'cv-publish-plan', f.input, type);
            assert.equal(plan.status, 200);
            assert.equal(plan.value.publication.state, 'planned');
            const input = {
              requestId: f.input.requestId,
              confirmation: plan.value.publication.confirmation,
              publish: true,
            };
            assert.equal(
              (
                await wirePost(base, 'cv-publish', input, type, {
                  origin: 'https://untrusted.test',
                })
              ).status,
              403
            );
            assert.equal(
              (
                await wirePost(
                  base,
                  'cv-publish',
                  { ...input, publish: false },
                  type
                )
              ).status,
              400
            );
            const answer = await wirePost(base, 'cv-publish', input, type);
            assert.equal(answer.value.publication.state, 'published');
            const count = f.calls.length;
            const response = await fetch(
              `${base}/api/vacancies/cv-publish-status?requestId=${input.requestId}`,
              { headers: { accept: type } }
            );
            assert.equal(
              decodeWire(
                await response.arrayBuffer(),
                response.headers.get('content-type')
              ).publication.commit,
              answer.value.publication.commit
            );
            assert.equal(
              (await fetch(`${base}/api/vacancies/cv-publish`)).status,
              405
            );
            assert.equal(f.calls.length, count);
          },
          {
            store: f.store,
            service: { cvPublication: f.options.cvPublication },
          }
        );
      } finally {
        await f.close();
      }
    }
  );
}

test(
  'foreground publication CLI freezes the plan and requires explicit --publish with its confirmation',
  { timeout: 20000 },
  async () => {
    const f = await cvPublicationFixture();
    let closes = 0;
    const output = [];
    const log = (value) => output.push(decodeWire(value));
    const commands = createVacancyCommands({
      openStore: async () => f.store,
      cvPublication: f.options.cvPublication,
    });
    f.store.close = async () => {
      closes++;
    };
    const args = {
      'request-id': 'cli-publication',
      repository: f.repository,
      resumes: 'saved123',
    };
    try {
      assert.equal(await commands['vacancies-cv-publish-plan'](args, log), 0);
      const publication = output.at(-1).publication;
      assert.equal(publication.state, 'planned');
      const confirm = {
        'request-id': args['request-id'],
        confirmation: publication.confirmation,
      };
      await assert.rejects(commands['vacancies-cv-publish'](confirm, log));
      assert.equal(
        await commands['vacancies-cv-publish'](
          { ...confirm, publish: true },
          log
        ),
        0
      );
      assert.equal(output.at(-1).publication.state, 'published');
      const count = f.calls.length;
      assert.equal(await commands['vacancies-cv-publish-status']({}, log), 0);
      assert.equal(f.calls.length, count);
      assert.equal(closes, 4);
      assert.match(VACANCY_HELP, /vacancies-cv-publish.*--publish=true/u);
    } finally {
      await f.close();
    }
  }
);

test(
  'offline publication recovery cannot replay an unfinished attempt or accept another identity',
  { timeout: 20000 },
  async () => {
    const f = await cvPublicationFixture();
    try {
      const { publication } = await f.service['cv-publish-plan'](f.input);
      const row = await f.store.get('jobs-cv-publication:publication-plan');
      await f.store.put({ ...row, state: 'attempting' });
      const reported = [];
      const api = createVacancyApi({
        get: async () => null,
        local: async () => f.store,
        report: async (...args) => {
          reported.push(args);
          return { publication };
        },
      });
      assert.equal(
        (await api.vacancyCvPublishStatus({ browserSlot: 'jobs' })).publication
          .state,
        'uncertain'
      );
      assert.equal(reported.length, 0);
      await api.vacancyCvPublishPlan(f.input);
      assert.deepEqual(reported[0][2], { network: true, read: false });
      await assert.rejects(
        api.vacancyCvPublish({
          requestId: 'another-plan',
          confirmation: publication.confirmation,
          publish: true,
        })
      );
      await assert.rejects(
        api.vacancyCvPublish({
          requestId: publication.requestId,
          confirmation: publication.confirmation,
          publish: false,
        })
      );
    } finally {
      await f.close();
    }
  }
);

test(
  'four-language publication controls require matching saved evidence and fresh consent',
  { timeout: 20000 },
  async () => {
    const f = await cvPublicationFixture();
    try {
      const { publication } = await f.service['cv-publish-plan'](f.input);
      const file = publication.files[0];
      const snapshot = {
        hash: file.hash,
        sha256: file.sourceSha256,
        savedAt: file.savedAt,
      };
      const state = {
        receipt: publication,
        repository: publication.repository,
        remote: publication.remote,
        directory: publication.directory,
        consent: false,
        loadError: false,
        setConsent() {},
      };
      for (const locale of ['en', 'ru', 'hi', 'zh']) {
        const render = (value, chosen = snapshot) =>
          renderInLocale(
            locale,
            React.createElement(CvSnapshotPublication, {
              publication: value,
              snapshot: chosen,
              busy: false,
              supported: true,
              t: (key) => translate(locale, key),
            })
          );
        const html = render(state);
        assert.ok(html.includes(translate(locale, 'cvPublish.title')));
        assert.doesNotMatch(html, /cvPublish\.[a-z]+/u);
        assert.match(
          html,
          /disabled=""[^>]+data-cv-publication-action="publish"/u
        );
        assert.doesNotMatch(
          render({ ...state, consent: true }),
          /disabled=""[^>]+data-cv-publication-action="publish"/u
        );
        assert.match(
          render(
            { ...state, consent: true },
            { ...snapshot, sha256: 'f'.repeat(64) }
          ),
          /disabled=""[^>]+data-cv-publication-action="publish"/u
        );
        assert.match(
          render({
            ...state,
            receipt: { ...publication, state: 'uncertain' },
            consent: true,
          }),
          /disabled=""[^>]+data-cv-publication-action="publish"/u
        );
      }
    } finally {
      await f.close();
    }
  }
);
