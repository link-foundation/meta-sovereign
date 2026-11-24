import { promises as fs } from 'node:fs';
import path from 'node:path';
import { formReportMarkdown } from './report-markdown.js';

export const persistFormReport = async (writer, report) => {
  try {
    return await writer(report);
  } catch {
    return { state: 'failed', code: 'form-report-write' };
  }
};

export const withFormReportFile = async (writer, report) => {
  if (writer) {
    report.reportFile = await persistFormReport(writer, report);
  }
  return report;
};

/** Save one private, uniquely named Markdown report without overwriting a run. */
export const createFormReportWriter =
  ({ directory = 'logs/forms' } = {}) =>
  async (report) => {
    const name = `${new Date().toISOString().replace(/[:.]/gu, '-')}-${globalThis.crypto.randomUUID()}.md`;
    const target = path.join(directory, name);
    let handle;
    try {
      if (Buffer.byteLength(JSON.stringify(report)) > 8 * 1024 ** 2) {
        throw new Error('Report source exceeds 8 MiB.');
      }
      const markdown = formReportMarkdown(report);
      if (Buffer.byteLength(markdown) > 8 * 1024 ** 2) {
        throw new Error('Report exceeds 8 MiB.');
      }
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      handle = await fs.open(target, 'wx', 0o600);
      await handle.writeFile(markdown, 'utf8');
      await handle.sync();
      await handle.close();
      handle = null;
      return { state: 'saved', path: target };
    } catch {
      if (handle) {
        await handle.close().catch(() => {});
        await fs.unlink(target).catch(() => {});
      }
      return { state: 'failed', code: 'form-report-write' };
    }
  };
