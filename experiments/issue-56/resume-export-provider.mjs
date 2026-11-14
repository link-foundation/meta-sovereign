import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createResumeExportReader } from '../../js/src/jobs/read-resume-exports.js';
import { industryDirectory } from '../../js/src/jobs/industries.js';
import {
  nativeResumeBytes,
  resumeIndustriesFixture,
} from './resume-export-fixture.mjs';
import { gate } from './vacancy-fixture.mjs';

/** Synthetic HH converter responses; the actual owned page performs every read. */
export const resumeExportProvider = async () => {
  const artifactRoot = await mkdtemp(join(tmpdir(), 'hh-resume-export-'));
  const downloads = [];
  const dictionaries = [];
  const started = gate();
  let signal;
  return {
    artifactRoot,
    downloads,
    dictionaries,
    prepare: (context) =>
      context.addCookies([
        {
          name: 'fixture_session',
          value: 'owner-only',
          domain: 'hh.ru',
          path: '/',
          secure: true,
        },
      ]),
    route: async (route, mode) => {
      const request = route.request();
      const url = new URL(request.url());
      if (
        url.origin !== 'https://hh.ru' ||
        !url.pathname.startsWith('/resume_converter/')
      ) {
        return false;
      }
      assert.equal(request.method(), 'GET');
      assert.match(
        await request.frame().evaluate(() => globalThis.document.cookie),
        /fixture_session=owner-only/u
      );
      const hash = url.searchParams.get('hash');
      const format =
        url.searchParams.get('type') === 'txt'
          ? 'html'
          : url.searchParams.get('type');
      assert.equal(
        url.pathname,
        `/resume_converter/resume.${format === 'html' ? 'txt' : format}`
      );
      downloads.push({ hash, format });
      const language = hash.startsWith('russian') ? 'ru' : 'en';
      await route.fulfill({
        status: 200,
        contentType:
          format === 'html'
            ? 'text/html; charset=utf-8'
            : 'application/octet-stream',
        body:
          mode === 'bad-pdf' && format === 'pdf'
            ? Buffer.from('<html>Login required</html>')
            : nativeResumeBytes(format, language),
      });
      return true;
    },
    service: ({ store, openSession }) => {
      const read = createResumeExportReader({
        store,
        openSession,
        artifactRoot,
        fetchIndustries: async ({ language }) => {
          dictionaries.push(language);
          return industryDirectory(resumeIndustriesFixture(language));
        },
      });
      return {
        artifactRoot,
        readResumeExports: (options, progress) => {
          signal = options.signal;
          started.resolve();
          return read(options, progress);
        },
      };
    },
    cancellation: async () => {
      await started.promise;
      if (!signal.aborted) {
        await new Promise((resolve) =>
          signal.addEventListener('abort', resolve, { once: true })
        );
      }
    },
    close: () => rm(artifactRoot, { recursive: true, force: true }),
  };
};
