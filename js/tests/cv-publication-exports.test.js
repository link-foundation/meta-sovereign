import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import { withCvPublicationFixture } from '../../experiments/issue-56/cv-publication-fixture.mjs';
import { seedPublicationExport } from '../../experiments/issue-56/cv-publication-export-fixture.mjs';
import { CvSnapshotPublication } from '../src/web/cv-publication-panel.js';
import { cvPublicationCommandInput } from '../src/cli/cv-publication-command.js';
import { createVacancyCommands } from '../src/cli/vacancy-commands.js';
import { translate } from '../src/web/i18n.js';
import { renderInLocale } from './util-render.js';
import { LINO_TEXT, LINO_BINARY, decodeWire } from '../src/transport/lino.js';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';

const confirm = (publication) => ({
  requestId: publication.requestId,
  confirmation: publication.confirmation,
  publish: true,
});
const nativeExportFixture = (work) =>
  withCvPublicationFixture(async (f) =>
    work(f, await seedPublicationExport(f))
  );

test(
  'publication accepts only the selected verified native export and retains its private bytes',
  { timeout: 20000 },
  async () =>
    nativeExportFixture(async (f, exported) => {
      await f.store.delete('jobs-cv-snapshots:jobs');
      const index = (await f.command(['diff', '--cached', '--binary'])).stdout;
      const { publication } = await f.service['cv-publish-plan'](
        exported.input
      );
      assert.equal(publication.exportId, exported.receipt.exportId);
      assert.equal(
        publication.files[0].sourceSha256,
        exported.receipt.files.find((file) => file.name === 'resume.json')
          .sha256
      );
      assert.equal(publication.files[0].savedAt, exported.receipt.capturedAt);
      assert.match(publication.files[0].content, /Software Engineer/u);
      assert.doesNotMatch(
        publication.files[0].content,
        /alex@example|private@example|12025550123|100000 USD|1990-01-01/u
      );
      const answer = await f.service['cv-publish'](confirm(publication));
      assert.equal(answer.publication.state, 'published');
      assert.equal(
        (
          await f.command(['rev-parse', 'refs/heads/main'], f.remote)
        ).stdout.trim(),
        answer.publication.commit
      );
      assert.equal(
        (await f.command(['diff', '--cached', '--binary'])).stdout,
        index
      );
      assert.deepEqual(
        await readFile(path.join(exported.folder, 'resume.json')),
        exported.content
      );
      assert.ok(
        (await readFile(path.join(exported.folder, 'resume.pdf'))).length
      );
      const count = f.calls.length;
      assert.equal(
        (
          await f.service['cv-publish-status']({
            requestId: publication.requestId,
          })
        ).publication.exportId,
        exported.receipt.exportId
      );
      assert.equal(f.calls.length, count);
    })
);

test(
  'foreground native-export publication CLI retains exact source identity and read-only status',
  { timeout: 20000 },
  async () =>
    nativeExportFixture(async (f, exported) => {
      const output = [];
      const commands = createVacancyCommands({
        openStore: async () => f.store,
        artifactRoot: f.artifactRoot,
        cvPublication: f.options.cvPublication,
      });
      const log = (value) => output.push(decodeWire(value));
      assert.equal(
        await commands['vacancies-cv-publish-plan'](
          {
            repository: f.repository,
            resumes: exported.receipt.hash,
            'export-id': exported.receipt.exportId,
            'request-id': 'native-cli',
          },
          log
        ),
        0
      );
      const publication = output.at(-1).publication;
      assert.equal(publication.exportId, exported.receipt.exportId);
      assert.equal(
        await commands['vacancies-cv-publish'](
          {
            'request-id': publication.requestId,
            confirmation: publication.confirmation,
            publish: true,
          },
          log
        ),
        0
      );
      assert.equal(output.at(-1).publication.state, 'published');
      const calls = f.calls.length;
      await commands['vacancies-cv-publish-status'](
        { 'request-id': publication.requestId },
        log
      );
      assert.equal(
        output.at(-1).publication.exportId,
        exported.receipt.exportId
      );
      assert.equal(f.calls.length, calls);
    })
);

test(
  'native publication rejects invalid identities, slots, receipts and changed private files before Git',
  { timeout: 20000 },
  async () =>
    nativeExportFixture(async (f, exported) => {
      const json = path.join(exported.folder, 'resume.json');
      for (const input of [
        { ...exported.input, exportId: '../pending' },
        { ...exported.input, browserSlot: 'other-slot' },
        { ...exported.input, resumes: ['missing123'] },
      ]) {
        await assert.rejects(f.service['cv-publish-plan'](input));
      }
      await writeFile(json, Buffer.alloc(exported.content.length, 32));
      await assert.rejects(f.service['cv-publish-plan'](exported.input));
      await writeFile(json, exported.content);
      const key = `jobs-resume-artifact:${exported.receipt.exportId}:${exported.receipt.hash}`;
      const original = await f.store.get(key);
      await f.store.put({ ...original, title: 'Another CV' });
      await assert.rejects(f.service['cv-publish-plan'](exported.input));
      assert.equal(f.calls.length, 0);
      await f.store.put(original);
      const { publication } = await f.service['cv-publish-plan'](
        exported.input
      );
      const count = f.calls.length;
      await writeFile(json, Buffer.alloc(exported.content.length, 32));
      await assert.rejects(f.service['cv-publish'](confirm(publication)));
      await writeFile(json, exported.content);
      await f.store.put({
        ...original,
        capturedAt: '2026-11-14T20:00:00.000Z',
      });
      await assert.rejects(f.service['cv-publish'](confirm(publication)));
      await f.store.delete(key);
      await assert.rejects(f.service['cv-publish'](confirm(publication)));
      assert.equal(f.calls.length, count);
      assert.equal(
        (
          await f.service['cv-publish-status']({
            requestId: publication.requestId,
          })
        ).publication.state,
        'planned'
      );
    })
);

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `native export publication source crosses foreground CLI parsing and trusted ${type} routes`,
    { timeout: 20000 },
    async () =>
      nativeExportFixture(async (f, exported) => {
        const parsed = cvPublicationCommandInput('cv-publish-plan', {
          repository: f.repository,
          resumes: exported.receipt.hash,
          'export-id': exported.receipt.exportId,
          'request-id': 'export-cli',
        });
        assert.equal(parsed.exportId, exported.receipt.exportId);
        await withRoutes(
          async (base) => {
            const plan = await wirePost(base, 'cv-publish-plan', parsed, type);
            assert.equal(plan.status, 200);
            assert.equal(
              plan.value.publication.exportId,
              exported.receipt.exportId
            );
            const answer = await wirePost(
              base,
              'cv-publish',
              confirm(plan.value.publication),
              type
            );
            assert.equal(answer.status, 200);
            assert.equal(answer.value.publication.state, 'published');
          },
          {
            store: f.store,
            service: {
              artifactRoot: f.artifactRoot,
              cvPublication: f.options.cvPublication,
            },
          }
        );
      })
  );
}

test(
  'native export source and consent are bound across four-language CV controls',
  { timeout: 20000 },
  async () =>
    nativeExportFixture(async (f, exported) => {
      const { publication } = await f.service['cv-publish-plan'](
        exported.input
      );
      const state = {
        receipt: publication,
        repository: publication.repository,
        remote: publication.remote,
        directory: publication.directory,
        consent: true,
        loadError: false,
        setConsent() {},
      };
      for (const locale of ['en', 'ru', 'hi', 'zh']) {
        const render = (
          receipt = publication,
          browserSlot = 'jobs',
          repository = publication.repository
        ) =>
          renderInLocale(
            locale,
            React.createElement(CvSnapshotPublication, {
              publication: { ...state, receipt, repository },
              exports: [exported.receipt],
              browserSlot,
              busy: false,
              supported: true,
              t: (key) => translate(locale, key),
            })
          );
        const html = render();
        assert.ok(html.includes(translate(locale, 'cvPublish.exportSource')));
        assert.doesNotMatch(html, /cvPublish\.[a-z]/u);
        assert.doesNotMatch(
          html,
          /disabled=""[^>]+data-cv-publication-action="publish"/u
        );
        assert.match(
          render({ ...publication, exportId: undefined }),
          /disabled=""[^>]+data-cv-publication-action="publish"/u
        );
        assert.match(
          render(publication, 'another'),
          /disabled=""[^>]+data-cv-publication-action="publish"/u
        );
        assert.match(
          render(
            publication,
            'jobs',
            path.join(publication.repository, 'different')
          ),
          /disabled=""[^>]+data-cv-publication-action="publish"/u
        );
      }
    })
);
