// Replay the native WebKit name/message form through the actual CV scenario.
// One native WebKit fixture supplies the page; the diagnostic is injected.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { webkit } from 'playwright';
import { verifyCvExperience } from '../../js/tests/helpers/e2e-cv-experience.mjs';
import { experienceBrowserFixture } from './experience-browser-fixture.mjs';
import { inspectCvLoading } from './cv-loading-inspect.mjs';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';

const parent = 'b61cf5fd504e8e928eec5e4ed869087f869dd395';
const before = process.argv.includes('--before');
let inspect = verifyCvExperience;
if (before) {
  const source = (name) =>
    execFileSync('git', ['show', `${parent}:${name}`], { encoding: 'utf8' });
  const body = source('experiments/issue-56/experience-inspect.mjs');
  const inspectParent = new Function(
    `return ${body
      .slice(
        body.indexOf('export const inspectExperience ='),
        body.indexOf('export const experienceInspectionCode =')
      )
      .replace('export const inspectExperience =', '')}`
  )();
  const wrapper = source('js/tests/helpers/e2e-cv-experience.mjs');
  inspect = new Function(
    'experienceBrowserFixture',
    'inspectExperience',
    'inspectCvLoading',
    'TUTORIAL_STORAGE_KEY',
    'TUTORIAL_VERSION',
    `return ${wrapper.slice(wrapper.indexOf('export const verifyCvExperience =')).replace('export const verifyCvExperience =', '')}`
  )(
    experienceBrowserFixture,
    inspectParent,
    inspectCvLoading,
    TUTORIAL_STORAGE_KEY,
    TUTORIAL_VERSION
  );
}
const browser = await webkit.launch({ headless: true });
let replayed = 0;
const replay = {
  browserType: () => ({ name: () => 'webkit' }),
  newContext: async (...args) => {
    const context = await browser.newContext(...args);
    context.on('page', (page) => {
      page.on('domcontentloaded', () => {
        if (replayed || !page.listenerCount('pageerror')) {
          return;
        }
        const url = new URL(page.url());
        if (url.hostname !== '127.0.0.1') {
          return;
        }
        replayed++;
        const error = new Error(
          `/${url.host}/api/vk/friends/stats due to access control checks.`
        );
        error.name = 'Fetch API cannot load http';
        page.emit('pageerror', error);
      });
    });
    return context;
  },
};
try {
  const result = await inspect(replay);
  assert.equal(replayed, 1);
  console.log(
    JSON.stringify({
      parent,
      before,
      replayed,
      nativeWebKit: true,
      injectedDiagnostic: true,
      ...result,
    })
  );
} finally {
  await browser.close();
}
