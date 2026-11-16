import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import { withCvPublicationFixture } from '../../experiments/issue-56/cv-publication-fixture.mjs';
import { seedExperiencePublication } from '../../experiments/issue-56/experience-publication-fixture.mjs';
import {
  storedExperienceDocument,
  saveExperienceDocument,
} from '../src/cv/experience-store.js';
import { cvPublicationCommandInput } from '../src/cli/cv-publication-command.js';
import { createVacancyCommands } from '../src/cli/vacancy-commands.js';
import { CvSnapshotPublication } from '../src/web/cv-publication-panel.js';
import { translate } from '../src/web/i18n.js';
import { renderInLocale } from './util-render.js';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import { LINO_TEXT, LINO_BINARY, decodeWire } from '../src/transport/lino.js';

const confirmation = ({ requestId, confirmation }) => ({
  requestId,
  confirmation,
  publish: true,
});

test(
  'foreground experience publication CLI reviews, publishes and recovers the exact source',
  { timeout: 20000 },
  async () => {
    await withCvPublicationFixture(async (f) => {
      const source = await seedExperiencePublication(f, 'linkedin');
      const commands = createVacancyCommands({
        openStore: async () => f.store,
        artifactRoot: f.artifactRoot,
        cvPublication: f.options.cvPublication,
      });
      let result;
      const invoke = async (operation, input) => {
        assert.equal(
          await commands[`vacancies-cv-publish${operation}`](input, (wire) => {
            result = decodeWire(wire);
          }),
          0
        );
        return result.publication;
      };
      const plan = await invoke('-plan', {
        repository: f.repository,
        'experience-revision': source.revision,
        'request-id': 'experience-cli',
      });
      assert.equal(plan.experienceRevision, source.revision);
      assert.equal(
        (
          await invoke('', {
            'request-id': plan.requestId,
            confirmation: plan.confirmation,
            publish: true,
          })
        ).state,
        'published'
      );
      const calls = f.calls.length;
      assert.equal(
        (await invoke('-status', { 'request-id': plan.requestId }))
          .experienceRevision,
        source.revision
      );
      assert.equal(f.calls.length, calls);
    });
  }
);

test(
  'experience documents are reviewed and published without private originals or pending plans',
  { timeout: 20000 },
  async () => {
    await withCvPublicationFixture(async (f) => {
      await f.store.delete('jobs-cv-snapshots:jobs');
      const staged = (await f.command(['diff', '--cached', '--binary'])).stdout;
      for (const platform of ['hh', 'linkedin']) {
        const source = await seedExperiencePublication(f, platform);
        const { publication } = await f.service['cv-publish-plan'](
          source.input
        );
        assert.equal(publication.experienceRevision, source.revision);
        assert.deepEqual(publication.resumes, [source.revision]);
        const [file] = publication.files;
        assert.equal(file.sourceSha256, source.revision);
        assert.equal(file.savedAt, source.document.source.capturedAt);
        assert.match(file.content, /Original narrative|Software Engineer/u);
        assert.match(file.content, /7\.540/u);
        assert.doesNotMatch(
          file.content,
          /private@example|1990-01-01|100000 USD|unknownFuture|job-native-1|Original media/u
        );
        const calls = f.calls.length;
        assert.equal(
          (await f.service['cv-publish-status'](source.input)).publication
            .state,
          'planned'
        );
        assert.equal(f.calls.length, calls, 'Status does not publish');
        const answer = await f.service['cv-publish'](confirmation(publication));
        assert.equal(answer.publication.state, 'published');
        const published = await f.command(
          ['show', `refs/heads/main:${file.path}`],
          f.remote
        );
        assert.equal(published.stdout, file.content);
        assert.deepEqual(
          await storedExperienceDocument(f.store, source.revision),
          {
            revision: source.revision,
            provenance: source.provenance,
            document: source.document,
          }
        );
        const after = f.calls.length;
        await f.service['cv-publish'](confirmation(publication));
        assert.equal(
          f.calls.length,
          after,
          'Confirmed effects are not replayed'
        );
      }
      assert.equal(
        (await f.command(['diff', '--cached', '--binary'])).stdout,
        staged
      );
      for (const [file, content] of [
        ['private-export.pdf', 'PRIVATE_PDF\n'],
        ['private-backup.json', 'PRIVATE_BACKUP\n'],
        ['pending-plan.lino', 'PRIVATE_PENDING_PLAN\n'],
      ]) {
        assert.equal(
          await readFile(path.join(f.repository, file), 'utf8'),
          content
        );
      }
    });
  }
);

test(
  'experience publication refuses source confusion, corrupted originals and incomplete public fields before Git',
  { timeout: 20000 },
  async () => {
    await withCvPublicationFixture(async (f) => {
      const source = await seedExperiencePublication(f);
      for (const change of [
        { experienceRevision: '../private' },
        { experienceRevision: 'f'.repeat(64) },
        { resumes: ['saved123'] },
        { exportId: 'some-native-export' },
        { experienceRevision: 123 },
      ]) {
        await assert.rejects(
          f.service['cv-publish-plan']({ ...source.input, ...change })
        );
      }
      const bad = globalThis.structuredClone(source.document);
      delete bad.jobs[0].title;
      const incomplete = await saveExperienceDocument(f.store, bad);
      await assert.rejects(
        f.service['cv-publish-plan']({
          ...source.input,
          experienceRevision: incomplete.revision,
        })
      );
      assert.equal(f.calls.length, 0);
      const { publication } = await f.service['cv-publish-plan'](source.input);
      const count = f.calls.length;
      const key = `secret:cv-experience:${source.revision}`;
      const row = await f.store.get(key);
      await f.store.put({ ...row, document: bad });
      await assert.rejects(f.service['cv-publish'](confirmation(publication)));
      await f.store.put(row);
      await f.store.delete(key);
      await assert.rejects(f.service['cv-publish'](confirmation(publication)));
      assert.equal(f.calls.length, count);
      assert.equal(
        (await f.service['cv-publish-status'](source.input)).publication.state,
        'planned'
      );
    });
  }
);

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `explicit experience revision crosses CLI parsing and trusted ${type} publication routes`,
    { timeout: 20000 },
    async () => {
      await withCvPublicationFixture(async (f) => {
        const source = await seedExperiencePublication(f);
        const parsed = cvPublicationCommandInput('cv-publish-plan', {
          repository: f.repository,
          'request-id': 'experience-wire',
          'experience-revision': source.revision,
        });
        assert.equal(parsed.experienceRevision, source.revision);
        await withRoutes(
          async (base) => {
            const response = await wirePost(
              base,
              'cv-publish-plan',
              parsed,
              type
            );
            assert.equal(response.status, 200);
            assert.equal(
              response.value.publication.experienceRevision,
              source.revision
            );
            const answer = await wirePost(
              base,
              'cv-publish',
              confirmation(response.value.publication),
              type
            );
            assert.equal(answer.status, 200);
            assert.equal(answer.value.publication.state, 'published');
          },
          {
            store: f.store,
            service: { cvPublication: f.options.cvPublication },
          }
        );
      });
    }
  );
}

test(
  'experience source identity binds four-language publication consent and rejects another captured revision',
  { timeout: 20000 },
  async () => {
    await withCvPublicationFixture(async (f) => {
      const source = await seedExperiencePublication(f);
      const { publication } = await f.service['cv-publish-plan'](source.input);
      for (const locale of ['en', 'ru', 'hi', 'zh']) {
        const render = (receipt = publication) =>
          renderInLocale(
            locale,
            React.createElement(CvSnapshotPublication, {
              publication: {
                receipt,
                repository: publication.repository,
                remote: publication.remote,
                directory: publication.directory,
                consent: true,
                loadError: false,
                setConsent() {},
              },
              experiences: [source.entry],
              browserSlot: 'jobs',
              busy: false,
              supported: true,
              t: (key) => translate(locale, key),
            })
          );
        const html = render();
        assert.ok(
          html.includes(translate(locale, 'cvPublish.experienceSource'))
        );
        assert.ok(html.includes(translate(locale, 'cvPublish.experienceHint')));
        assert.doesNotMatch(html, /cvPublish\.[a-z]/u);
        assert.doesNotMatch(
          html,
          /disabled=""[^>]+data-cv-publication-action="publish"/u
        );
        assert.match(
          render({ ...publication, experienceRevision: 'f'.repeat(64) }),
          /disabled=""[^>]+data-cv-publication-action="publish"/u
        );
      }
    });
  }
);
