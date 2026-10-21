/**
 * GramJS speaking Telegram's current API layer (R-Y76).
 *
 * GramJS builds every TL class from one schema text (`telegram/tl/apiTl.js`)
 * and names its layer when it connects (`AllTLObjects.LAYER`). Its copy
 * is older than Telegram's, and Telegram sends a client what its layer
 * cannot describe — checklists, polls since their new constructor, newer
 * media — as `messageMediaUnsupported`, which no later read can repair.
 * So before GramJS loads, its schema module is given the layer Telegram
 * publishes (./telegram-api/layer-N.tl, made by
 * js/scripts/telegram-schema.mjs), and its LAYER set to match.
 *
 * Anything going wrong here leaves GramJS as it was: older, but working.
 */

import { readFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';

export const LAYER = 225;

const SCHEMA = new URL(`./telegram-api/layer-${LAYER}.tl`, import.meta.url);

let installed = null;

/**
 * Give GramJS the newer schema; `{ layer, from? , error? }`. Must run
 * before the first `import('telegram')`; later it only reports.
 */
export const installTelegramLayer = ({ schema = SCHEMA } = {}) => {
  if (installed) {
    return installed;
  }
  try {
    const require = createRequire(import.meta.url);
    const file = require.resolve('telegram/tl/apiTl.js');
    if (require.cache[file]) {
      // GramJS was loaded first: its classes are already built.
      const { LAYER: current } = require('telegram/tl/AllTLObjects.js');
      installed = { layer: current, error: 'telegram loaded before' };
      return installed;
    }
    const tl = readFileSync(schema, 'utf8');
    const seeded = new Module(file);
    seeded.filename = file;
    seeded.loaded = true;
    seeded.exports = tl;
    require.cache[file] = seeded;
    const all = require('telegram/tl/AllTLObjects.js');
    const from = all.LAYER;
    all.LAYER = LAYER;
    installed = { layer: LAYER, from };
  } catch (error) {
    installed = { layer: null, error: String(error?.message ?? error) };
  }
  return installed;
};

/** `import('telegram')` at the current layer. */
export const importTelegram = async () => {
  installTelegramLayer();
  return import('telegram');
};
