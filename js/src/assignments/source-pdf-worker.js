import { parentPort, workerData } from 'node:worker_threads';
import { getDocument } from 'pdfjs-serverless';

const MAX_PAGES = 20;
const MAX_TEXT_LENGTH = 30000;
const MAX_TEXT_ITEMS = 5000;

const readPageText = async (page, budget) => {
  const reader = page.streamTextContent().getReader();
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        return text.trim();
      }
      for (const item of value.items) {
        const part = item.str + (item.hasEOL ? '\n' : '');
        budget.items -= 1;
        budget.characters -= part.length;
        if (budget.items < 0 || budget.characters < 0) {
          return null;
        }
        text += part;
      }
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
};

const readDocumentText = async (data) => {
  const loading = getDocument({
    data,
    stopAtErrors: true,
    useSystemFonts: false,
    disableFontFace: true,
    useWorkerFetch: false,
    useWasm: false,
    verbosity: 0,
  });
  try {
    const doc = await loading.promise;
    if (!doc.numPages || doc.numPages > MAX_PAGES) {
      return null;
    }
    const pages = [];
    const budget = {
      items: MAX_TEXT_ITEMS,
      characters: MAX_TEXT_LENGTH - 2 * (doc.numPages - 1),
    };
    for (let index = 1; index <= doc.numPages; index++) {
      const page = await doc.getPage(index);
      const text = await readPageText(page, budget);
      if (!text) {
        return null;
      }
      pages.push(text);
      page.cleanup();
    }
    return pages.join('\n\n');
  } finally {
    await loading.destroy();
  }
};

try {
  parentPort.postMessage(await readDocumentText(workerData));
} catch {
  parentPort.postMessage(null);
} finally {
  parentPort.close();
}
