import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { technologyFixture } from './technology-fixture.mjs';
import {
  resumeCvFixture,
  resumeExportReceipt,
} from './resume-export-fixture.mjs';
import { sanitizedResumeCv } from '../../js/src/jobs/resume-cv.js';

export const bilingualTechnologyCv = (language) => {
  const cv = sanitizedResumeCv(resumeCvFixture()).cv;
  cv.language = language;
  cv.title = language === 'ru' ? 'Разработчик платформы' : 'Platform developer';
  cv.skills = ['Postgres', 'Postgres', 'JavaScript'];
  cv.about =
    language === 'ru'
      ? 'Разрабатываю полезные сервисы.\n\nТехнические навыки\nЯзыки:\nJavaScript, PHP 8\nИнструменты:\nGit, git\nЛичные: люблю прогулки.\nСохранять эту строку.'
      : 'I build useful services.\n\nTechnical Skills\nLanguages:\nPHP, JavaScript\nDatabases:\nPostgreSQL\nPersonal: I enjoy walking.\nKeep this line.';
  cv.jobs[0].company = language === 'ru' ? 'АртБридж' : 'ArtBridge';
  cv.jobs[0].description =
    language === 'ru'
      ? 'Создавал сервисы на .NET Core.\n\nИспользуемые технологии:\n\nPostgres, Git, git\n\nБиография остаётся без изменений.'
      : 'Built .NET Framework services.\n\nTechnologies and tools:\nPostgreSQL, Docker\n\nKeep this final narrative unchanged.';
  return cv;
};

/** Private integrity-checked artifact files; provider access is intentionally absent. */
export const cvTechnologyFixture = async () => {
  const base = await technologyFixture();
  const sources = [];
  const receipts = [];
  const rows = base.rows.filter((row) => !row.id.startsWith('jobs-resume-'));
  for (const row of base.rows.filter((item) =>
    item.id.startsWith('jobs-resume-')
  )) {
    await base.store.delete(row.id);
  }
  for (const language of ['ru', 'en']) {
    const cv = bilingualTechnologyCv(language);
    const receipt = resumeExportReceipt(
      language === 'ru' ? 'c'.repeat(32) : 'b'.repeat(32)
    );
    receipt.language = language;
    receipt.title = cv.title;
    const bytes = Buffer.from(JSON.stringify(cv));
    receipt.files = receipt.files.map((file) =>
      file.name === 'resume.json'
        ? {
            ...file,
            size: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          }
        : file
    );
    const folder = join(base.artifactRoot, receipt.exportId, receipt.hash);
    await mkdir(folder, { recursive: true, mode: 0o700 });
    await writeFile(join(folder, 'resume.json'), bytes, { mode: 0o600 });
    for (const id of [
      `jobs-resume-artifact:${receipt.exportId}:${receipt.hash}`,
      `jobs-resume-export:jobs:${receipt.hash}`,
    ]) {
      const row = { id, version: 1, ...receipt };
      await base.store.put(row);
      rows.push(row);
    }
    const json = receipt.files.find((file) => file.name === 'resume.json');
    sources.push({
      cv,
      identity: Object.fromEntries(
        ['exportId', 'hash', 'browserSlot', 'title', 'language', 'capturedAt']
          .map((key) => [key, receipt[key]])
          .concat([['sha256', json.sha256]])
      ),
    });
    receipts.push(receipt);
  }
  return {
    ...base,
    rows,
    sources,
    receipts,
    input: {
      browserSlot: 'jobs',
      exports: receipts.map(({ exportId, hash }) => ({ exportId, hash })),
    },
  };
};
