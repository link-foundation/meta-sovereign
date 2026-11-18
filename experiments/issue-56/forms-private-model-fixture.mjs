import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { saveAnswerModel } from '../../js/src/automation/answer-model-config.js';
import { resumeMarkdown } from './resume-profile-fixture.mjs';
import { modelReviewFixture } from './forms-model-review-fixture.mjs';

export const privateModelMarkdown = `${resumeMarkdown}\nBuilt accessible browser interfaces.\n`;

/** Small private fixture; no external model process or account. */
export const privateModelFixture = async (run) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'forms-private-model-'));
  const store = Object.assign(createMemoryStore(), {
    logFile: path.join(directory, 'data.lino'),
  });
  const file = path.join(directory, 'resume/resume.md');
  let record;
  try {
    await mkdir(path.dirname(file));
    await writeFile(file, privateModelMarkdown);
    const env = await modelReviewFixture({
      store,
      seed: (current) =>
        saveAnswerModel(current, { enabled: true, revision: null }),
    });
    record = env.record;
    await run({
      ...env,
      directory,
      file,
      get writes() {
        return env.writes;
      },
    });
  } finally {
    await record?.reviewPlan?.targets.dispose();
    await rm(directory, { recursive: true, force: true });
  }
};
