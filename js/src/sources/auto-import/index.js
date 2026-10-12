/**
 * Browser auto-import (Connections -> "Import with browser").
 * Node-only: the local JS server drives a real browser through
 * browser-commander. See ./manager.js for the job lifecycle.
 */

export { autoImportRecipes, describeRecipes } from './recipes.js';
export {
  importDownloadedFile,
  extractVisibleMessages,
  scrapedRowsToLinks,
} from './files.js';
export {
  createAutoImportManager,
  launchWithBrowserCommander,
  probeBrowserAutomation,
} from './manager.js';
export {
  createSignIns,
  browserName,
  hostAppName,
  FULL_DISK_ACCESS_URL,
} from './sign-ins.js';
export {
  readZipEntries,
  readTarGzEntries,
  parseCsv,
  archiveReaderFor,
} from './archive.js';
