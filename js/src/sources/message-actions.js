/**
 * Everything the user does to a message, the API first and the network's
 * own web app second (R-Y38).
 *
 * Sending already worked this way (./browser-sender.js); this module does
 * the same for every other action: edit, delete, react, mark read,
 * forward. For each one:
 *
 * 1. the network adapter's `live` method (`editMessage`, `deleteMessages`,
 *    `react`, `markRead`, `forwardMessages`) with the saved connection's
 *    token, when the adapter has it;
 * 2. otherwise — or when the API refuses (no token, no right, an action
 *    the API does not have) — the same action done in the web app by
 *    ./browser-actions.js, in the browser profile the user signed in to
 *    once.
 *
 * An adapter marks an error `fallback: false` when the action may already
 * be done (a connected account), so it is never done twice; `safe-mode`
 * and `bad-draft` never reach the browser either.
 */

import { createFallbackSender } from './browser-sender.js';
import { WEB_UIS } from './web-uis.js';

/** Action name → the adapter's `live` method and the browser's. */
export const MESSAGE_ACTIONS = Object.freeze({
  edit: 'editMessage',
  delete: 'deleteMessages',
  react: 'react',
  read: 'markRead',
  forward: 'forwardMessages',
});

// What the web app table must describe for the browser to do an action.
const BROWSER_NEEDS = {
  edit: (ui) => Boolean(ui.actions?.edit),
  delete: (ui) => Boolean(ui.actions?.delete),
  react: (ui) => Boolean(ui.actions?.reaction || ui.actions?.quickReaction),
  read: (ui) => Boolean(ui.messages),
  forward: (ui) => Boolean(ui.actions?.forward),
};

const codedError = (message, code) =>
  Object.assign(new Error(message), { code });

const adapterOf = (getSource, source) => {
  try {
    return getSource?.(source) ?? null;
  } catch {
    return null;
  }
};

/**
 * @param {object} options
 * @param {(source: string) => object} [options.getSource] adapter lookup
 * @param {(source: string) => Promise<object>} [options.optionsFor] the
 *   saved connection's `live` options (token, ids) for a network
 * @param {() => object} [options.browser] the browser sender, created on
 *   first use
 * @param {object} [options.platforms] web app table, default `WEB_UIS`
 * @param {Function} [options.log]
 */
export const createMessageActions = ({
  getSource = null,
  optionsFor = async () => ({}),
  browser = () => null,
  platforms = WEB_UIS,
  log = () => {},
} = {}) => {
  const apiFor = (action, source) => {
    const method = MESSAGE_ACTIONS[action];
    const live = adapterOf(getSource, source)?.live;
    if (typeof live?.[method] !== 'function') {
      return null;
    }
    return async (params) => {
      const result = await live[method](params, await optionsFor(source));
      // "Not here" (no signed-in account, no such chat) is a refusal: the
      // web app is tried next.
      if (result?.supported === false) {
        throw codedError(
          `${source}: the API cannot "${action}" here`,
          'unsupported-action'
        );
      }
      return result;
    };
  };

  const browserFor = (action, source) => {
    const ui = platforms[source];
    if (!ui || !BROWSER_NEEDS[action](ui)) {
      return null;
    }
    return (params) => {
      const sender = browser();
      const method = MESSAGE_ACTIONS[action];
      if (typeof sender?.[method] !== 'function') {
        throw codedError(
          `${source}: no browser is available for "${action}"`,
          'no-sender'
        );
      }
      return sender[method](params);
    };
  };

  /** Which actions a network can do, and how. */
  const supports = (source) =>
    Object.fromEntries(
      Object.keys(MESSAGE_ACTIONS).map((action) => [
        action,
        {
          api: Boolean(apiFor(action, source)),
          browser: Boolean(browserFor(action, source)),
        },
      ])
    );

  /**
   * Do `action` (`edit`, `delete`, `react`, `read`, `forward`) with
   * `params` ({ source, chat, id | ids, text, emoji, revoke, toChat … }).
   * Resolves to the result with `via: 'api' | 'browser'`.
   */
  const perform = async (action, params = {}) => {
    if (!MESSAGE_ACTIONS[action]) {
      throw codedError(`unknown message action "${action}"`, 'bad-action');
    }
    const source = params.source;
    const apiSend = apiFor(action, source);
    const browserSend = browserFor(action, source);
    if (!apiSend && !browserSend) {
      throw codedError(
        `${source}: "${action}" is possible neither through the API nor in the web app`,
        'unsupported-action'
      );
    }
    return createFallbackSender({ apiSend, browserSend, log, action })(params);
  };

  return { perform, supports };
};
