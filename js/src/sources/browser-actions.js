/**
 * What a person does to a message in a network's web app — edit it,
 * delete it, react to it, forward it, read the chat — done the same way
 * through browser-commander (R-Y38). It is the fallback of
 * ./message-actions.js when the network's API cannot do the action.
 *
 * Each action finds the message in the open chat by its id (the
 * `messages.idAttribute` of ./web-uis.js), marks that element so later
 * selectors can address it, opens its menu — a right click
 * (`actions.menu: 'contextmenu'`) or a button inside the message shown
 * on hover — and clicks the menu items the table names. A step whose
 * selector matches nothing fails with a code naming the table field to
 * update, never silently.
 */

/* global document, MouseEvent -- the page-side helpers run in the page */

import { setTimeout as sleep } from 'node:timers/promises';

/** The attribute the target message gets while an action runs. */
export const TARGET_ATTRIBUTE = 'data-ms-target';
const TARGET = `[${TARGET_ATTRIBUTE}="1"]`;

const codedError = (message, code) =>
  Object.assign(new Error(message), { code });

/**
 * Page-side: mark the message whose id is `spec.id` (and only it) and
 * scroll it into view. A row's id is its `idAttribute`, or the part of
 * it `idPattern` captures (WhatsApp's `true_<jid>_<id>`). Returns
 * whether it was found. Self-contained: it runs in the browser.
 */
export const markMessage = (spec) => {
  const attribute = spec.targetAttribute;
  for (const node of document.querySelectorAll(`[${attribute}]`)) {
    node.removeAttribute(attribute);
  }
  const want = String(spec.id);
  const pattern = spec.idPattern ? new RegExp(spec.idPattern) : null;
  const idOf = (node) => {
    const raw = spec.idAttribute ? node.getAttribute(spec.idAttribute) : null;
    if (raw === null || raw === undefined) {
      return null;
    }
    const match = pattern ? pattern.exec(raw) : null;
    return match ? match[1] : raw;
  };
  const rows = Array.from(document.querySelectorAll(spec.item));
  const found = rows.find((node) => {
    const id = idOf(node);
    return id === want || (id !== null && id.endsWith(`_${want}`));
  });
  if (!found) {
    return false;
  }
  found.setAttribute(attribute, '1');
  found.scrollIntoView?.({ block: 'center' });
  return true;
};

/** Page-side: scroll to the newest message, which marks the chat read. */
export const scrollToNewest = (spec) => {
  const rows = document.querySelectorAll(spec.item);
  const last = rows[rows.length - 1];
  last?.scrollIntoView?.({ block: 'end' });
  return rows.length;
};

/**
 * Page-side: the visible chat list. A chat's id is its `idAttribute`, or
 * what `linkPattern` captures from the `link` element's href.
 */
export const extractChats = (spec) => {
  const squash = (value) =>
    String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  const text = (node, selector, attribute) => {
    const found = selector ? node.querySelector(selector) : null;
    if (!found) {
      return '';
    }
    return squash(
      attribute ? found.getAttribute(attribute) : found.textContent
    );
  };
  const pattern = spec.linkPattern ? new RegExp(spec.linkPattern) : null;
  const idOf = (node) => {
    const own = spec.idAttribute ? node.getAttribute(spec.idAttribute) : null;
    if (own) {
      return own;
    }
    const link = spec.link
      ? node.matches?.(spec.link)
        ? node
        : node.querySelector(spec.link)
      : null;
    const href = link?.getAttribute('href') ?? '';
    const match = pattern ? pattern.exec(href) : null;
    return match ? decodeURIComponent(match[1]) : null;
  };
  return Array.from(document.querySelectorAll(spec.item))
    .slice(0, spec.limit)
    .map((node) => {
      const title = text(node, spec.title, spec.titleAttribute);
      const unreadText = text(node, spec.unread);
      return {
        chat: idOf(node) ?? (title ? `title:${title}` : null),
        title: title || null,
        preview: text(node, spec.preview) || null,
        time: text(node, spec.time) || null,
        unread: spec.unread
          ? Number.parseInt(unreadText, 10) ||
            (node.querySelector(spec.unread) ? 1 : 0)
          : 0,
      };
    })
    .filter((row) => row.chat);
};

/** Page-side: select the composer's text, so typing replaces it. */
export const selectComposerText = (selector) => {
  const node = document.querySelector(selector);
  if (!node) {
    return false;
  }
  node.focus();
  if (typeof node.select === 'function') {
    node.select();
  } else {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = globalThis.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
  return true;
};

/** Page-side fallback for a right click: a `contextmenu` event. */
export const dispatchContextMenu = (selector) => {
  const node = document.querySelector(selector);
  if (!node) {
    return false;
  }
  const box = node.getBoundingClientRect();
  node.dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2,
    })
  );
  return true;
};

/**
 * The steps every action is made of, over the sender's helpers:
 * `waitFor(commander, selector)`, `firstMatch(commander, selector)`.
 */
const createSteps = ({ waitFor, firstMatch, settleMs, clock }) => {
  const supports = (ui, field) => Boolean(ui.actions?.[field]);

  const needs = (source, ui, field) => {
    if (!supports(ui, field)) {
      throw codedError(
        `${source}: the web app has no "${field}" here`,
        'unsupported-action'
      );
    }
  };

  // Click the selector of `field` (or `value`), once it shows.
  const step = async (
    commander,
    source,
    ui,
    field,
    value = ui.actions?.[field]
  ) => {
    const found = value ? await waitFor(commander, value) : null;
    if (!found) {
      throw codedError(
        `${source}: "${field}" not found in the web app (selector ${value ?? 'none'}); update WEB_UIS.${source}.actions.${field}`,
        value ? 'web-ui-changed' : 'unsupported-action'
      );
    }
    await commander.clickButton({ selector: found, scrollIntoView: true });
    await sleep(settleMs);
    return found;
  };

  // Find the message by id and mark it as the target.
  const target = async (commander, source, ui, id) => {
    const found = await commander.evaluate({
      fn: markMessage,
      args: [{ ...ui.messages, id, targetAttribute: TARGET_ATTRIBUTE }],
    });
    if (!found) {
      throw codedError(
        `${source}: message ${id} is not on the page`,
        'message-not-found'
      );
    }
  };

  // A right click, or the menu button inside the message (on hover).
  const openMenu = async (commander, page, source, ui) => {
    const menu = ui.actions?.menu;
    if (menu === 'contextmenu') {
      if (typeof page?.click === 'function') {
        await page.click(TARGET, { button: 'right' });
      } else {
        await commander.evaluate({ fn: dispatchContextMenu, args: [TARGET] });
      }
    } else if (menu) {
      await page?.hover?.(TARGET);
      const inside = `${TARGET} ${menu.split(',')[0].trim()}`;
      const button =
        (await firstMatch(commander, inside)) ??
        (await waitFor(commander, menu));
      if (!button) {
        throw codedError(
          `${source}: the message menu was not found; update WEB_UIS.${source}.actions.menu`,
          'web-ui-changed'
        );
      }
      await commander.clickButton({ selector: button, scrollIntoView: true });
    }
    await sleep(settleMs);
  };

  const done = (source, chat, extra) => ({
    via: 'browser',
    source,
    chat: String(chat),
    at: clock().toISOString(),
    ...extra,
  });

  return { supports, needs, step, target, openMenu, done, firstMatch, waitFor };
};

const editMessage = async (ctx, { source, chat, id, text }) => {
  const ui = ctx.uiFor(source);
  ctx.needs(source, ui, 'edit');
  const body = String(text ?? '');
  if (!body.trim()) {
    throw codedError(`${source}: the new text is empty`, 'bad-draft');
  }
  await ctx.inChat(source, chat, async (commander, page) => {
    await ctx.target(commander, source, ui, id);
    await ctx.openMenu(commander, page, source, ui);
    await ctx.step(commander, source, ui, 'edit');
    const composer = await ctx.focusComposer(source, ui, commander);
    await commander.evaluate({ fn: selectComposerText, args: [composer] });
    await ctx.typeLines(commander, body);
    if (ctx.supports(ui, 'editSave')) {
      await ctx.step(commander, source, ui, 'editSave');
    } else {
      await ctx.pressSend(ui, commander);
    }
  });
  return ctx.done(source, chat, { id: String(id), edited: true });
};

const deleteMessages = async (ctx, { source, chat, ids, revoke = true }) => {
  const ui = ctx.uiFor(source);
  ctx.needs(source, ui, 'delete');
  const deleted = [];
  await ctx.inChat(source, chat, async (commander, page) => {
    for (const id of ids ?? []) {
      await ctx.target(commander, source, ui, id);
      await ctx.openMenu(commander, page, source, ui);
      await ctx.step(commander, source, ui, 'delete');
      const forAll = revoke ? ui.actions.deleteForAll : null;
      const box = forAll ? await ctx.firstMatch(commander, forAll) : null;
      if (box) {
        await commander.clickButton({ selector: box });
      }
      const confirm =
        !revoke && ui.actions.deleteForMe
          ? ui.actions.deleteForMe
          : ui.actions.deleteConfirm;
      if (confirm) {
        await ctx.step(commander, source, ui, 'deleteConfirm', confirm);
      }
      deleted.push(String(id));
    }
  });
  return ctx.done(source, chat, { deleted });
};

const react = async (ctx, { source, chat, id, emoji }) => {
  const ui = ctx.uiFor(source);
  const actions = ui.actions ?? {};
  if (!actions.reaction && !actions.quickReaction) {
    ctx.needs(source, ui, 'reaction');
  }
  await ctx.inChat(source, chat, async (commander, page) => {
    await ctx.target(commander, source, ui, id);
    if (actions.react) {
      await page?.hover?.(TARGET);
      await ctx.step(commander, source, ui, 'react');
    } else if (actions.menu) {
      await ctx.openMenu(commander, page, source, ui);
    }
    const pick = actions.reaction ? actions.reaction(emoji) : null;
    const found = pick ? await ctx.waitFor(commander, pick) : null;
    if (found) {
      await commander.clickButton({ selector: found });
    } else if (
      actions.quickReaction === 'dblclick' &&
      typeof page?.dblclick === 'function'
    ) {
      await commander.pressKey({ key: 'Escape' });
      await page.dblclick(TARGET);
    } else {
      throw codedError(
        `${source}: reaction ${emoji} is not offered by the web app`,
        'unsupported-reaction'
      );
    }
  });
  return ctx.done(source, chat, { id: String(id), emoji });
};

const forwardMessages = async (
  ctx,
  { source, fromChat, ids, toChat, toTitle }
) => {
  const ui = ctx.uiFor(source);
  ctx.needs(source, ui, 'forward');
  await ctx.inChat(source, fromChat, async (commander, page) => {
    for (const id of ids ?? []) {
      await ctx.target(commander, source, ui, id);
      await ctx.openMenu(commander, page, source, ui);
      await ctx.step(commander, source, ui, 'forward');
      if (ctx.supports(ui, 'forwardSearch')) {
        await ctx.step(commander, source, ui, 'forwardSearch');
        await ctx.typeLines(commander, String(toTitle ?? toChat));
      }
      await ctx.step(commander, source, ui, 'forwardResult');
      if (ctx.supports(ui, 'forwardSend')) {
        await ctx.step(commander, source, ui, 'forwardSend');
      } else if (await ctx.firstMatch(commander, ui.composer)) {
        await ctx.pressSend(ui, commander);
      }
    }
  });
  return ctx.done(source, fromChat, {
    forwarded: (ids ?? []).map(String),
    toChat: String(toChat),
  });
};

const markRead = async (ctx, { source, chat }) => {
  const ui = ctx.uiFor(source);
  const seen = await ctx.inChat(source, chat, (commander) =>
    commander.evaluate({ fn: scrollToNewest, args: [ui.messages] })
  );
  return ctx.done(source, chat, { read: true, seen: Number(seen) || 0 });
};

const readChats = async (ctx, { source, limit = 50 }) => {
  const ui = ctx.uiFor(source);
  if (!ui.chats) {
    throw codedError(
      `${source}: the web app's chat list is not described`,
      'unsupported-action'
    );
  }
  const rows = await ctx.inList(source, (commander) =>
    commander.evaluate({ fn: extractChats, args: [{ ...ui.chats, limit }] })
  );
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    source,
    via: 'browser',
  }));
};

/**
 * The actions, over the sender's helpers: `inChat(source, chat, fn)`
 * runs `fn(commander, page)` with the chat open and `inList(source, fn)`
 * with the chat list open, `uiFor(source)` is the table entry, and
 * `waitFor`, `firstMatch`, `focusComposer`, `typeLines`, `pressSend`
 * are the sender's own.
 */
export const createBrowserActions = ({ settleMs = 300, clock, ...deps }) => {
  const ctx = {
    ...deps,
    ...createSteps({ ...deps, settleMs, clock: clock ?? (() => new Date()) }),
  };
  return {
    editMessage: (params) => editMessage(ctx, params),
    deleteMessages: (params) => deleteMessages(ctx, params),
    react: (params) => react(ctx, params),
    forwardMessages: (params) => forwardMessages(ctx, params),
    markRead: (params) => markRead(ctx, params),
    readChats: (params) => readChats(ctx, params),
  };
};
