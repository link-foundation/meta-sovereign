import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createVacancyService } from '../src/jobs/service.js';
import { resumeCvFromLino } from '../src/jobs/resume-cv.js';
import { cvPublicationFixture } from '../../experiments/issue-56/cv-publication-fixture.mjs';

const withPublication = async (work, options) => {
  const fixture = await cvPublicationFixture(options);
  try {
    await work(fixture);
  } finally {
    await fixture.close();
  }
};
const plan = async (f, input = f.input) =>
  (await f.service['cv-publish-plan'](input)).publication;
const consent = (publication) => ({
  requestId: publication.requestId,
  browserSlot: publication.browserSlot,
  confirmation: publication.confirmation,
  publish: true,
});
const head = async (f, remote = false) =>
  (
    await f.command(
      ['rev-parse', 'refs/heads/main'],
      remote ? f.remote : f.repository
    )
  ).stdout.trim();

test(
  'publication commits only sanitized saved snapshots and preserves unrelated staged/private files and pending plans',
  { timeout: 20000 },
  async () =>
    withPublication(async (f) => {
      const beforeHead = await head(f);
      const beforeIndex = (await f.command(['diff', '--cached', '--binary']))
        .stdout;
      const publication = await plan(f);
      assert.equal(publication.state, 'planned');
      assert.equal(await head(f), beforeHead);
      assert.equal(await head(f, true), beforeHead);
      const file = publication.files[0];
      assert.equal(file.content.includes('private@example.test'), false);
      assert.equal(
        resumeCvFromLino(file.content).about,
        'Public engineering work'
      );
      const published = (await f.service['cv-publish'](consent(publication)))
        .publication;
      assert.equal(published.state, 'published');
      assert.equal(await head(f, true), published.commit);
      assert.equal(await head(f), published.commit);
      assert.equal(
        (await f.command(['diff', '--cached', '--binary'])).stdout,
        beforeIndex
      );
      assert.equal(
        (
          await f.command([
            'diff-tree',
            '--no-commit-id',
            '--name-only',
            '-r',
            beforeHead,
            published.commit,
          ])
        ).stdout.trim(),
        file.path
      );
      assert.equal(
        (
          await f.command(
            ['show', `${published.commit}:${file.path}`],
            f.remote
          )
        ).stdout,
        file.content
      );
      assert.equal(
        await readFile(path.join(f.repository, file.path), 'utf8'),
        file.content
      );
      for (const [name, bytes] of Object.entries({
        'pending-plan.lino': 'PRIVATE_PENDING_PLAN\n',
        'private-export.pdf': 'PRIVATE_PDF\n',
        'private-backup.json': 'PRIVATE_BACKUP\n',
        'private-staged.txt': 'PRIVATE_STAGED\n',
      })) {
        assert.equal(
          await readFile(path.join(f.repository, name), 'utf8'),
          bytes
        );
      }
      const count = f.calls.length;
      assert.deepEqual(
        (await f.service['cv-publish'](consent(publication))).publication,
        published
      );
      assert.deepEqual(
        (await f.service['cv-publish-status']({})).publication,
        published
      );
      const recovered = createVacancyService(f.options);
      try {
        assert.deepEqual(
          (await recovered['cv-publish-status']({})).publication,
          published
        );
        assert.equal(f.calls.length, count);
      } finally {
        await recovered.stop();
      }
    })
);

test(
  'a second explicit plan confirms unchanged snapshots without another commit or push',
  { timeout: 20000 },
  async () =>
    withPublication(async (f) => {
      const first = await plan(f);
      await f.service['cv-publish'](consent(first));
      const current = await head(f);
      const second = await plan(f, { ...f.input, requestId: 'second-plan' });
      const answer = await f.service['cv-publish'](consent(second));
      assert.equal(answer.publication.state, 'unchanged');
      assert.equal(answer.publication.commit, null);
      assert.equal(await head(f), current);
      assert.equal(f.calls.filter((args) => args.includes('push')).length, 1);
    })
);

test(
  'publication refuses missing consent, expiry, changed saved CVs and tampered journals before effects',
  { timeout: 20000 },
  async () => {
    let time = Date.parse('2026-11-14T21:00:00Z');
    await withPublication(
      async (f) => {
        const publication = await plan(f);
        const calls = f.calls.length;
        await assert.rejects(
          f.service['cv-publish']({ ...consent(publication), publish: false })
        );
        await assert.rejects(
          f.service['cv-publish']({
            ...consent(publication),
            confirmation: 'b'.repeat(64),
          })
        );
        const saved = await f.store.get('jobs-cv-snapshots:jobs');
        await f.store.put({
          ...saved,
          snapshots: [
            { ...saved.snapshots[0], savedAt: '2026-11-14T20:01:00.000Z' },
          ],
        });
        await assert.rejects(f.service['cv-publish'](consent(publication)));
        await f.store.put(saved);
        time += 86400000;
        await assert.rejects(f.service['cv-publish'](consent(publication)));
        time -= 86400000;
        const raw = await f.store.get('jobs-cv-publication:publication-plan');
        await f.store.put({ ...raw, base: 'c'.repeat(40) });
        await assert.rejects(f.service['cv-publish-status']({}));
        assert.equal(f.calls.length, calls);
        assert.equal(await head(f), await head(f, true));
      },
      { now: () => time }
    );
  }
);

test(
  'an existing different target and staged snapshot are retained without publication',
  { timeout: 20000 },
  async () =>
    withPublication(async (f) => {
      const publication = await plan(f);
      const file = publication.files[0];
      await mkdir(path.dirname(path.join(f.repository, file.path)), {
        recursive: true,
      });
      await writeFile(
        path.join(f.repository, file.path),
        'PRIVATE_PENDING_PLAN'
      );
      await f.command(['add', '--', file.path]);
      const staged = (await f.command(['diff', '--cached', '--binary'])).stdout;
      const before = await head(f);
      const answer = await f.service['cv-publish'](consent(publication));
      assert.equal(answer.publication.state, 'uncertain');
      assert.equal(await head(f), before);
      assert.equal(
        (await f.command(['diff', '--cached', '--binary'])).stdout,
        staged
      );
      assert.equal(
        await readFile(path.join(f.repository, file.path), 'utf8'),
        'PRIVATE_PENDING_PLAN'
      );
      assert.equal(
        f.calls.some((args) => args.includes('push')),
        false
      );
      await assert.rejects(
        f.service['cv-publish-plan']({
          ...f.input,
          requestId: 'conflicting-plan',
        })
      );
    })
);

test(
  'a remote branch advance refuses publication without force or replay',
  { timeout: 20000 },
  async () =>
    withPublication(async (f) => {
      const publication = await plan(f);
      const tree = (
        await f.command(['rev-parse', 'HEAD^{tree}'])
      ).stdout.trim();
      const other = (
        await f.command([
          'commit-tree',
          tree,
          '-p',
          publication.base,
          '-m',
          'Independent remote advance',
        ])
      ).stdout.trim();
      await f.command(['push', 'origin', `${other}:refs/heads/main`]);
      const answer = await f.service['cv-publish'](consent(publication));
      assert.equal(answer.publication.state, 'uncertain');
      assert.equal(await head(f), publication.base);
      assert.equal(await head(f, true), other);
      const count = f.calls.length;
      await f.service['cv-publish'](consent(publication));
      assert.equal(f.calls.length, count);
      assert.equal(
        f.calls.some((args) => args.includes('--force')),
        false
      );
    })
);

test(
  'a lost push receipt stays uncertain through restart and repeated confirmation',
  { timeout: 20000 },
  async () =>
    withPublication(
      async (f) => {
        const publication = await plan(f);
        const answer = await f.service['cv-publish'](consent(publication));
        assert.equal(answer.publication.state, 'uncertain');
        assert.equal(answer.publication.code, 'jobs-cv-publication-unverified');
        assert.equal(await head(f, true), answer.publication.commit);
        const count = f.calls.length;
        const recovered = createVacancyService(f.options);
        try {
          assert.equal(
            (await recovered['cv-publish-status']({})).publication.state,
            'uncertain'
          );
          await recovered['cv-publish'](consent(publication));
          assert.equal(f.calls.length, count);
        } finally {
          await recovered.stop();
        }
      },
      {
        intercept: async ({ args, proceed }) => {
          const answer = await proceed();
          if (args.includes('push')) {
            throw new Error('PRIVATE_TRANSPORT_OUTPUT');
          }
          return answer;
        },
      }
    )
);

test(
  'a refused attempt acknowledgement restores the plan before any Git effect',
  { timeout: 20000 },
  async () =>
    withPublication(async (f) => {
      const publication = await plan(f);
      const original = f.store.put.bind(f.store);
      f.store.put = async (row) => {
        await original(row);
        if (row.state === 'attempting') {
          throw new Error('PRIVATE_STORAGE_FAILURE');
        }
      };
      const count = f.calls.length;
      await assert.rejects(f.service['cv-publish'](consent(publication)));
      assert.equal(f.calls.length, count);
      assert.equal(
        (await f.service['cv-publish-status']({})).publication.state,
        'planned'
      );
      assert.equal(await head(f), publication.base);
    })
);

test(
  'a refused commit acknowledgement holds the remote and never retries the stored attempt',
  { timeout: 20000 },
  async () =>
    withPublication(async (f) => {
      const publication = await plan(f);
      const original = f.store.put.bind(f.store);
      f.store.put = async (row) => {
        await original(row);
        if (row.state === 'committed') {
          throw new Error('PRIVATE_STORAGE_FAILURE');
        }
      };
      const answer = await f.service['cv-publish'](consent(publication));
      assert.equal(answer.publication.state, 'uncertain');
      assert.match(answer.publication.commit, /^[a-f\d]{40}$/u);
      assert.equal(await head(f, true), publication.base);
      assert.equal(await head(f), publication.base);
      const count = f.calls.length;
      await f.service['cv-publish'](consent(publication));
      assert.equal(f.calls.length, count);
    })
);

test(
  'Stop drains the owned publication before releasing the workspace and never pushes again',
  { timeout: 20000 },
  async () => {
    let entered;
    const ready = new Promise((resolve) => {
      entered = resolve;
    });
    await withPublication(
      async (f) => {
        const publication = await plan(f);
        const task = f.service['cv-publish'](consent(publication));
        await ready;
        await assert.rejects(
          f.service['cv-publish-plan']({
            ...f.input,
            requestId: 'overlapping-plan',
          }),
          { code: 'jobs-busy' }
        );
        await f.service.stop();
        const answer = await task;
        assert.equal(answer.publication.state, 'uncertain');
        assert.equal(await head(f, true), publication.base);
        const count = f.calls.length;
        assert.equal(
          (await f.service['cv-publish-status']({})).publication.state,
          'uncertain'
        );
        assert.equal(f.calls.length, count);
      },
      {
        intercept: async ({ args, options, proceed }) => {
          if (!args.includes('push')) {
            return proceed();
          }
          entered();
          return new Promise((_resolve, reject) => {
            options.signal.addEventListener(
              'abort',
              () => reject(options.signal.reason),
              { once: true }
            );
          });
        },
      }
    );
  }
);
