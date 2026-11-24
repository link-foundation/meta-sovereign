import test from 'node:test';
import assert from 'node:assert/strict';
import * as cv from '../src/cv/index.js';
import { createMemoryStore } from '../src/storage/index.js';
import { privateSyncId } from '../src/sync/reconcile-records.js';
import { modelFingerprint } from '../src/automation/answer-model-context.js';
import {
  formalPayloadOf,
  formalReportBody,
  formalKindMarker,
  formalVersionMarker,
} from '../src/cv/formal-report-content.js';
import {
  confirmedFormalReport,
  confirmedFormalPreview,
} from '../src/cv/formal-report-record.js';
import { createFormalExperienceReports } from '../src/cv/formal-report-service.js';
import {
  formalReportFixture,
  settledFormalReport,
} from '../../experiments/issue-56/formal-report-fixture.mjs';

test(
  'public preview binds exact acknowledged workplace failures, commands and all translator outputs without disclosure',
  { timeout: 10000 },
  async () => {
    const fixture = await formalReportFixture();
    try {
      const preview = await cv.previewFormalExperienceReport(fixture.store, {
        planRequestId: fixture.preview.planRequestId,
      });
      await confirmedFormalPreview(preview, preview.planRequestId);
      assert.equal(preview.groups[0].version, '0.355.34');
      const samples = preview.groups[0].samples;
      assert.ok(samples.length >= 3);
      assert.ok(samples.every((sample) => sample.kind === 'misrouted'));
      assert.ok(
        !samples.some((sample) => sample.source === fixture.hh.profile.about)
      );
      assert.ok(preview.excluded['outside-workplace'] > 0);
      const sample = samples.find((row) => row.source.includes('\n'));
      assert.deepEqual(sample.command, {
        executable: 'formal-ai',
        args: [
          'chat',
          '--silent',
          '--prompt',
          `Translate "${sample.source}" to English`,
        ],
        environment: { FORMAL_AI_LIVE_API: '1' },
      });
      assert.equal(sample.output, 'web search requested');
      assert.deepEqual(
        sample.alternatives.map((value) => value.provider),
        ['haiku', 'luna']
      );
      assert.equal(sample.alternatives[0].reason, 'translation-gap');
      assert.match(sample.alternatives[1].output, /Leading a team/u);
      assert.equal(fixture.calls.length, 0);
      assert.ok(
        (await fixture.store.query()).every((row) => privateSyncId(row.id))
      );
      await assert.rejects(
        confirmedFormalPreview(
          { ...preview, repository: 'different/repository' },
          preview.planRequestId
        )
      );
    } finally {
      await fixture.close();
    }
  }
);

test(
  'process/usage errors and texts every translator retains are excluded; short phrase gaps remain reportable',
  { timeout: 10000 },
  async () => {
    for (const kind of ['usage', 'process', 'unchanged', 'short-phrase']) {
      const fixture = await formalReportFixture({
        translate: async (provider, descriptor, input) => {
          if (kind === 'process' && provider === 'formal-ai') {
            throw new Error('Synthetic missing binary');
          }
          return {
            model: descriptor.model,
            outputs: input.texts.map((source) =>
              kind === 'unchanged'
                ? source
                : provider !== 'formal-ai'
                  ? 'Complete English translation.'
                  : kind === 'usage'
                    ? 'error: unexpected argument --silent\nUsage: formal-ai chat'
                    : 'I could not translate: translation gap'
            ),
          };
        },
      });
      try {
        if (kind === 'short-phrase') {
          assert.ok(
            fixture.preview.groups[0].samples.some(
              (sample) => sample.kind === 'short-phrase'
            )
          );
        } else {
          assert.deepEqual(fixture.preview.groups, [], kind);
        }
        assert.equal(fixture.calls.length, 0);
      } finally {
        await fixture.close();
      }
    }
  }
);

test(
  'dry run searches both marker formats before phrases; disabled reporting has no GitHub calls and publish requires exact consent',
  { timeout: 10000 },
  async () => {
    const fixture = await formalReportFixture();
    try {
      await assert.rejects(
        fixture.reports.start({
          ...fixture.input(),
          mode: 'publish',
          confirm: false,
        })
      );
      await assert.rejects(
        fixture.reports.start({ ...fixture.input(), review: '0'.repeat(64) })
      );
      assert.equal(fixture.calls.length, 0);
      await fixture.reports.start(fixture.input('disabled', 'off'));
      assert.equal(
        (await settledFormalReport(fixture.reports, 'disabled')).phase,
        'completed'
      );
      assert.equal(fixture.calls.length, 0);
      await fixture.reports.start(fixture.input());
      const dry = await settledFormalReport(fixture.reports, 'formal-report');
      await confirmedFormalReport(dry, dry.requestId);
      assert.equal(dry.phase, 'completed');
      assert.equal(dry.actions[0].operation, 'create');
      assert.equal(dry.results[0].state, 'dry-run');
      assert.deepEqual(
        fixture.calls.map((row) => row.term),
        [
          'meta-sovereign:formal-ai:translation:misrouted',
          'hh-job-application-automation formal-ai-failure kind=misrouted',
          'web search requested',
        ]
      );
      assert.equal(
        fixture.calls.some((row) => row.operation === 'write'),
        false
      );
    } finally {
      await fixture.close();
    }
  }
);

test(
  'publication uses its acknowledgement URL and durable binding prevents duplicates even before search indexing',
  { timeout: 10000 },
  async () => {
    const fixture = await formalReportFixture({ search: async () => [] });
    try {
      const input = fixture.input('first-publication', 'publish');
      await fixture.reports.start(input);
      const first = await settledFormalReport(fixture.reports, input.requestId);
      assert.equal(first.phase, 'completed');
      assert.equal(
        first.results[0].url,
        'https://github.com/link-assistant/formal-ai/issues/101'
      );
      assert.equal(first.results[0].state, 'published');
      assert.deepEqual(await fixture.reports.start(input), first);
      const again = fixture.input('new-request', 'publish');
      await fixture.reports.start(again);
      const second = await settledFormalReport(
        fixture.reports,
        again.requestId
      );
      assert.equal(second.results[0].state, 'already-reported');
      assert.equal(
        fixture.calls.filter((row) => row.operation === 'write').length,
        1
      );
    } finally {
      await fixture.close();
    }
  }
);

test(
  'related kinds on one issue share one comment per version and updates preserve earlier exact samples',
  { timeout: 10000 },
  async () => {
    const fixture = await formalReportFixture({
      translate: async (provider, descriptor, input) => ({
        model: descriptor.model,
        outputs: input.texts.map((source) =>
          provider !== 'formal-ai'
            ? 'Complete English translation.'
            : source.includes('\n')
              ? 'web search requested'
              : 'I could not translate: translation gap'
        ),
      }),
    });
    try {
      fixture.addIssue(
        42,
        fixture.preview.groups[0].samples
          .map((sample) => formalKindMarker(sample.kind))
          .join('\n')
      );
      const earlier = {
        ...fixture.preview.groups[0].samples[0],
        source: 'Earlier workplace evidence',
      };
      fixture.comments.set(42, [
        {
          id: 77,
          user: { login: 'fixture-owner' },
          html_url:
            'https://github.com/link-assistant/formal-ai/issues/42#issuecomment-77',
          body: formalReportBody('0.355.34', [earlier]),
        },
      ]);
      await fixture.reports.start(fixture.input('merge', 'publish'));
      const row = await settledFormalReport(fixture.reports, 'merge');
      assert.equal(row.phase, 'completed');
      assert.equal(row.actions.length, 1);
      assert.equal(row.actions[0].operation, 'update-comment');
      const samples = formalPayloadOf(fixture.comments.get(42)[0].body).samples;
      assert.ok(samples.some((sample) => sample.source === earlier.source));
      assert.equal(
        samples.length,
        fixture.preview.groups[0].samples.length + 1
      );
      assert.equal(fixture.comments.get(42).length, 1);
      assert.equal(
        fixture.calls.filter((call) => call.operation === 'write').length,
        1
      );
    } finally {
      await fixture.close();
    }
  }
);

test(
  'a public version comment edited or created during planning is preserved without a write',
  { timeout: 10000 },
  async () => {
    for (const exists of [true, false]) {
      const fixture = await formalReportFixture();
      try {
        fixture.addIssue(42, formalKindMarker('misrouted'));
        const comment = {
          id: 77,
          user: { login: 'fixture-owner' },
          html_url:
            'https://github.com/link-assistant/formal-ai/issues/42#issuecomment-77',
          body: formalReportBody('0.355.34', []),
        };
        fixture.comments.set(42, exists ? [comment] : []);
        const comments = fixture.github.comments;
        let reads = 0;
        fixture.github.comments = async (...args) => {
          if (++reads === 2) {
            comment.body += '\nConcurrent public evidence';
            fixture.comments.set(42, [comment]);
          }
          return comments(...args);
        };
        await fixture.reports.start(fixture.input('concurrent', 'publish'));
        const row = await settledFormalReport(fixture.reports, 'concurrent');
        assert.equal(row.phase, 'failed');
        assert.equal(row.pending, null);
        assert.match(
          fixture.comments.get(42)[0].body,
          /Concurrent public evidence/u
        );
        assert.equal(
          fixture.calls.filter((call) => call.operation === 'write').length,
          0
        );
      } finally {
        await fixture.close();
      }
    }
  }
);

test(
  'a closed matching issue becomes a regression reference; foreign or malformed version comments cannot be overwritten',
  { timeout: 10000 },
  async () => {
    const fixture = await formalReportFixture();
    try {
      const issue = fixture.addIssue(
        9,
        formalKindMarker('misrouted'),
        'closed'
      );
      await fixture.reports.start(fixture.input('regression'));
      const row = await settledFormalReport(fixture.reports, 'regression');
      assert.equal(row.actions[0].operation, 'create');
      assert.match(
        row.actions[0].body,
        /Regression of https:\/\/github.com\/link-assistant\/formal-ai\/issues\/9/u
      );
      issue.state = 'open';
      fixture.comments.set(9, [
        {
          id: 5,
          user: { login: 'someone-else' },
          body: formalVersionMarker('0.355.34'),
        },
      ]);
      await fixture.reports.start(fixture.input('foreign', 'publish'));
      assert.equal(
        (await settledFormalReport(fixture.reports, 'foreign')).phase,
        'failed'
      );
      fixture.comments.get(9)[0].user.login = 'fixture-owner';
      await fixture.reports.start(fixture.input('malformed', 'publish'));
      assert.equal(
        (await settledFormalReport(fixture.reports, 'malformed')).phase,
        'failed'
      );
      assert.equal(
        fixture.calls.filter((call) => call.operation === 'write').length,
        0
      );
    } finally {
      await fixture.close();
    }
  }
);

test(
  'legacy same-version comments receive new evidence in place without removing previous text',
  { timeout: 10000 },
  async () => {
    const fixture = await formalReportFixture();
    try {
      fixture.addIssue(
        88,
        '<!-- hh-job-application-automation formal-ai-failure kind=misrouted version=0.352.1 -->'
      );
      const previous =
        'Exact older workplace evidence.\n<!-- hh-job-application-automation formal-ai-failure kind=misrouted version=0.355.34 -->';
      fixture.comments.set(88, [
        {
          id: 80,
          user: { login: 'fixture-owner' },
          html_url:
            'https://github.com/link-assistant/formal-ai/issues/88#issuecomment-80',
          body: previous,
        },
      ]);
      await fixture.reports.start(fixture.input('legacy-merge', 'publish'));
      const row = await settledFormalReport(fixture.reports, 'legacy-merge');
      assert.equal(row.phase, 'completed');
      assert.equal(row.actions[0].operation, 'update-comment');
      assert.ok(fixture.comments.get(88)[0].body.startsWith(previous));
      assert.equal(
        formalPayloadOf(fixture.comments.get(88)[0].body).samples.length,
        fixture.preview.groups[0].samples.length
      );
      assert.equal(fixture.comments.get(88).length, 1);
    } finally {
      await fixture.close();
    }
  }
);

test(
  'lost publication acknowledgement blocks replay for both the same request and a new owner/request',
  { timeout: 10000 },
  async () => {
    let writes = 0;
    const fixture = await formalReportFixture({
      write: async () => {
        writes++;
        throw new Error('Synthetic lost response');
      },
    });
    let restarted;
    try {
      const input = fixture.input('lost', 'publish');
      await fixture.reports.start(input);
      const unknown = await settledFormalReport(fixture.reports, 'lost');
      assert.equal(unknown.phase, 'unknown');
      assert.equal(unknown.code, 'cv-formal-report-outcome-unknown');
      assert.equal((await fixture.reports.start(input)).phase, 'unknown');
      assert.equal((await fixture.reports.stop(input)).phase, 'unknown');
      const store = createMemoryStore();
      for (const row of await fixture.store.query()) {
        await store.put(row);
      }
      restarted = createFormalExperienceReports({
        store,
        github: fixture.github,
      });
      await restarted.start(fixture.input('different-request', 'publish'));
      const blocked = await settledFormalReport(restarted, 'different-request');
      assert.equal(blocked.phase, 'failed');
      assert.equal(blocked.code, 'cv-formal-report-prior-outcome-unknown');
      assert.equal(writes, 1);
    } finally {
      await restarted?.close();
      await fixture.close();
    }
  }
);

test(
  'Stop and shutdown drain owned search or publication; pending writes retain uncertainty',
  { timeout: 10000 },
  async () => {
    for (const operation of ['search', 'write']) {
      let entered;
      const started = new Promise((resolve) => {
        entered = resolve;
      });
      let drained = false;
      const fixture = await formalReportFixture({
        [operation]: async (_input, signal) => {
          entered();
          await new Promise((resolve) =>
            signal.addEventListener('abort', resolve, { once: true })
          );
          drained = true;
          signal.throwIfAborted();
        },
      });
      try {
        const input = fixture.input(`stop-${operation}`, 'publish');
        await fixture.reports.start(input);
        await started;
        if (operation === 'write') {
          await fixture.reports.close();
        } else {
          await fixture.reports.stop(input);
        }
        const row = await fixture.reports.status(input);
        assert.equal(drained, true);
        assert.equal(row.phase, operation === 'write' ? 'unknown' : 'stopped');
      } finally {
        await fixture.close();
      }
    }
  }
);

test(
  'rejected admission starts nothing and forged receipt URLs are refused even with recomputed digests',
  { timeout: 10000 },
  async () => {
    const fixture = await formalReportFixture();
    try {
      const before = await fixture.store.query();
      fixture.store.flush = async () => {
        throw new Error('Synthetic disk failure');
      };
      await assert.rejects(
        fixture.reports.start(fixture.input('disk-failure', 'publish'))
      );
      assert.deepEqual(await fixture.store.query(), before);
      assert.equal(fixture.calls.length, 0);
      delete fixture.store.flush;
      await fixture.reports.start(fixture.input('receipt'));
      const row = await settledFormalReport(fixture.reports, 'receipt');
      const { fingerprint: _fingerprint, ...content } = row;
      content.results[0].url = 'https://foreign.example/';
      await assert.rejects(
        confirmedFormalReport(
          { ...content, fingerprint: await modelFingerprint(content) },
          row.requestId
        )
      );
    } finally {
      await fixture.close();
    }
  }
);
