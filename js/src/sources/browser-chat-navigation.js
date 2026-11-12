/* global window, document */
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  browserDocumentIdentity,
  chooseBrowserChatDocument,
  resolveBrowserChatListDocument,
  resolveBrowserChoiceDocument,
} from './browser-choice-document.js';
import {
  browserInactiveView,
  withInactiveBrowserView,
} from './browser-inactive-view.js';
import { browserChatViewState } from './browser-chat-view-state.js';
import { createBrowserScanControl } from './browser-scan-control.js';
import {
  browserChatReplyView,
  revealBrowserChatReply,
} from './browser-chat-reply-view.js';
import { browserTextReceipt } from '../automation/question-browser-state.js';
import {
  claimBrowserHistoryTail,
  verifyBrowserHistoryTransition,
} from './browser-chat-history-tail.js';

const failure = (reason) =>
  Object.assign(new Error('The inactive chat view could not be preserved'), {
    code: `browser-chat-view-${reason}`,
    scanReason: reason,
    historyReason: reason,
    fallback: false,
  });
const chatAt = (address, ui) => {
  const url = new URL(address);
  return ui.location.origins.includes(url.origin) &&
    !url.username &&
    !url.password
    ? new RegExp(ui.location.pathPattern).exec(url.pathname)?.[1]
    : undefined;
};
const historyBack = ({ token, count }) => {
  const state = window[Symbol.for('meta-sovereign.browser-inactive-view.v1')];
  if (state?.token !== token || state.interrupted || document.hasFocus()) {
    return false;
  }
  window.history.go(-count);
  return true;
};
const bindingOf = async (frame) => ({
  frame,
  key: (await frame.evaluate(browserDocumentIdentity, 'body')).key,
  url: frame.url(),
  length: await frame.evaluate(() => window.history.length),
});
const sameDocument = (current, original) =>
  current.frame === original.frame &&
  current.identity.key === original.identity.key &&
  current.owner === original.owner;
const documentFor = (commander, page, ui, target) =>
  target
    ? resolveBrowserChoiceDocument(commander, page, ui, target)
    : resolveBrowserChatListDocument(commander, page, ui);

class ChatNavigation {
  constructor({
    commander,
    page,
    ui,
    signal,
    waitMs = 50,
    navigationMs = 5000,
  }) {
    Object.assign(this, { commander, page, ui, signal, waitMs, navigationMs });
    this.spec = {
      composer: ui.composer,
      chats: ui.chats,
      messages: ui.messages,
      chatScan: ui.chatScan,
    };
    this.token = randomUUID();
    this.changed = false;
    this.restoration = { restored: false, reason: 'unavailable' };
    this.adapter = Object.fromEntries(
      ['evaluate', 'evaluateOwner', 'prepareInactiveView', 'clickButton'].map(
        (method) => [method, (input) => this.call(method, input)]
      )
    );
    this.navigated = (frame) => {
      const binding = this.bindings.find((item) => item.frame === frame);
      if (!binding || !this.allowed(binding)) {
        this.changed = true;
      }
    };
    this.invalidate = () => {
      this.changed = true;
    };
  }

  trace(phase, reason) {
    if (process.env.MS_BROWSER_CHAT_VIEW_DEBUG === '1') {
      console.error('[browser-chat-view]', { phase, reason });
    }
  }

  async selectOriginal() {
    const target = chatAt(this.page.url(), this.ui);
    if (target) {
      return {
        target,
        selected: await chooseBrowserChatDocument(this.page, this.ui, target),
      };
    }
    const candidates = [];
    const targets = new Set(
      this.page
        .frames()
        .map((frame) => chatAt(frame.url(), this.ui))
        .filter(Boolean)
    );
    for (const candidate of [null, ...targets]) {
      try {
        candidates.push({
          target: candidate,
          selected: await chooseBrowserChatDocument(
            this.page,
            this.ui,
            candidate,
            !candidate
          ),
        });
      } catch {
        // Hidden, untrusted or ambiguous documents do not establish a selection.
      }
    }
    if (candidates.length !== 1) {
      throw failure('document-unverified');
    }
    return candidates[0];
  }

  async open() {
    const original = await this.selectOriginal();
    this.originalTarget = original.target;
    this.original = original.selected;
    this.bindings = await Promise.all(
      [...new Set([this.page.mainFrame(), this.original.frame])].map(bindingOf)
    );
    this.initial = this.bindings.map((binding) => ({ ...binding }));
    this.currentDocument = await documentFor(
      this.commander,
      this.page,
      this.ui,
      this.originalTarget
    );
  }

  allowed(binding) {
    return (
      binding.frame.url() === binding.url ||
      (this.pending?.chat &&
        chatAt(binding.frame.url(), this.ui) === this.pending.chat) ||
      (this.pending?.restore &&
        binding.frame.url() ===
          this.initial.find((item) => item.frame === binding.frame).url)
    );
  }

  async historyPosition() {
    const history = await this.historySession.send('Page.getNavigationHistory');
    return {
      index: history.currentIndex,
      ids: history.entries.map((entry) => entry.id),
    };
  }

  async admitHistory() {
    this.historySession = await this.page.context().newCDPSession(this.page);
    this.position = await this.historyPosition();
    this.historyTail = await claimBrowserHistoryTail(
      this.page,
      this.bindings,
      this.position
    );
    this.initialPosition = this.position;
  }

  async verify() {
    if (
      this.changed ||
      this.page.isClosed() ||
      this.page.mainFrame() !== this.bindings[0].frame
    ) {
      throw failure('document-changed');
    }
    if (
      this.historySession &&
      !this.pending &&
      JSON.stringify(await this.historyPosition()) !==
        JSON.stringify(this.position)
    ) {
      throw failure('history-changed');
    }
    for (const binding of this.bindings) {
      if (
        !this.allowed(binding) ||
        (await binding.frame.evaluate(browserDocumentIdentity, 'body')).key !==
          binding.key
      ) {
        throw failure('document-changed');
      }
      if (this.inactiveToken) {
        const result = await binding.frame.evaluate(browserInactiveView, {
          token: this.inactiveToken,
          operation: 'status',
        });
        if (result.state !== 'ready') {
          throw failure(result.state);
        }
      }
      if (
        !this.pending &&
        (await binding.frame.evaluate(() => window.history.length)) !==
          binding.length
      ) {
        throw failure('history-changed');
      }
    }
  }

  async update() {
    const position = await this.historyPosition();
    if (
      !verifyBrowserHistoryTransition(
        this.pending?.restore ? this.initialPosition : this.position,
        position,
        Boolean(this.pending?.restore)
      )
    ) {
      throw failure('history-changed');
    }
    this.position = position;
    for (const binding of this.bindings) {
      const length = await binding.frame.evaluate(() => window.history.length);
      if (length !== position.ids.length) {
        throw failure('history-changed');
      }
      binding.url = binding.frame.url();
      binding.length = length;
    }
  }

  async call(method, input) {
    if (input?.args?.[0]?.operation !== 'release') {
      await this.verify();
    }
    return this.currentDocument[method](input);
  }

  async view(operation, extra = {}) {
    const result = await this.adapter.evaluate({
      fn: browserChatViewState,
      args: [
        {
          operation,
          token: this.token,
          inactiveToken: this.inactiveToken,
          ui: this.spec,
          ...extra,
        },
      ],
    });
    if (result.state !== 'ready' && operation !== 'release') {
      throw failure(result.state);
    }
    return result;
  }

  async wait(read) {
    const deadline = globalThis.performance.now() + this.navigationMs;
    do {
      await this.verify();
      const result = await read();
      if (result) {
        return result;
      }
      await sleep(this.waitMs);
    } while (globalThis.performance.now() < deadline);
    throw failure('navigation-timeout');
  }

  async reveal(chat) {
    const { control } = createBrowserScanControl(this.adapter, {
      item: this.ui.chats.item,
      inactiveToken: this.inactiveToken,
    });
    try {
      if ((await control('open')).state !== 'ready') {
        throw failure('list-unavailable');
      }
      await this.wait(async () => {
        if (this.signal?.aborted) {
          throw failure('cancelled');
        }
        if ((await this.view('locate', { chat })).found) {
          return true;
        }
        const current = await control('status');
        if (current.state !== 'ready') {
          throw failure(current.state);
        }
        if (current.loading) {
          return false;
        }
        if (current.bottom) {
          throw failure('chat-unavailable');
        }
        const moved = await control('move', {
          top: current.top + Math.max(1, Math.floor(current.view * 0.7)),
        });
        if (moved.state !== 'ready') {
          throw failure(moved.state);
        }
        return false;
      });
    } finally {
      await control('release', { restore: false }).catch(() => {});
    }
  }

  async visit(chat, read) {
    await this.verify();
    if (this.signal?.aborted) {
      throw failure('cancelled');
    }
    const target = String(this.ui.target({ chat }));
    if (chatAt(this.original.frame.url(), this.ui) !== target) {
      if (this.position.index >= 48) {
        throw failure('history-capacity');
      }
      await this.reveal(target);
      if (this.signal?.aborted) {
        throw failure('cancelled');
      }
      this.pending = { chat: target };
      const activated = await this.original.frame.evaluate(
        browserChatViewState,
        {
          operation: 'visit',
          token: this.token,
          inactiveToken: this.inactiveToken,
          ui: this.spec,
          chat: target,
        }
      );
      if (activated.state !== 'activated') {
        this.pending = null;
        throw failure(activated.state);
      }
      const selected = await this.wait(async () => {
        try {
          return await chooseBrowserChatDocument(this.page, this.ui, target);
        } catch {
          return null;
        }
      });
      if (!sameDocument(selected, this.original)) {
        throw failure('document-changed');
      }
      await this.update();
      this.currentDocument = await documentFor(
        this.commander,
        this.page,
        this.ui,
        target
      );
      this.pending = null;
      await this.verify();
    }
    if (this.signal?.aborted) {
      throw failure('cancelled');
    }
    this.trace('visit', 'ready');
    return read(this.adapter, target, () => this.verify(), this.inactiveToken);
  }

  async restoreRoutes() {
    this.pending = { restore: true };
    for (const binding of this.bindings) {
      const saved = this.initial.find((item) => item.frame === binding.frame);
      if (binding.frame.url() !== saved.url) {
        const count = this.position.index - this.initialPosition.index;
        if (
          count <= 0 ||
          !(await binding.frame.evaluate(historyBack, {
            token: this.inactiveToken,
            count,
          }))
        ) {
          throw failure('history-unavailable');
        }
        await this.wait(() => binding.frame.url() === saved.url);
      }
    }
    await this.update();
    this.currentDocument = await documentFor(
      this.commander,
      this.page,
      this.ui,
      this.originalTarget
    );
    this.pending = null;
  }

  async restore() {
    let replyView;
    try {
      await this.verify();
      await this.restoreRoutes();
      await this.view('restore-filter');
      await sleep(this.waitMs);
      await this.view('restore-position');
      await sleep(this.waitMs);
      if (this.reply && !this.signal?.aborted) {
        const state = await revealBrowserChatReply({
          document: this.adapter,
          ui: this.ui,
          reply: this.reply,
          token: this.inactiveToken,
          verify: () => this.verify(),
          waitMs: this.waitMs,
          view: (operation, reply) =>
            this.original.frame.evaluate(browserChatReplyView, {
              operation,
              reply,
              token: this.token,
              inactiveToken: this.inactiveToken,
              ui: this.spec,
            }),
        });
        replyView = {
          state,
          chat: this.reply.chat,
          messageId: this.reply.messageId,
        };
        this.trace('reply-view', state);
      }
      const receipt = await this.view('receipt');
      receipt.fields.historyPosition =
        this.position.index === this.initialPosition.index;
      const history = {
        positionRestored: receipt.fields.historyPosition,
        lengthBefore: this.initialPosition.ids.length,
        lengthAfter: this.position.ids.length,
        reusedOwnedForward: this.historyTail.reused,
      };
      return {
        history,
        restored: Object.values(receipt.fields).every(Boolean),
        fields: receipt.fields,
        reason: 'checked',
        ...(replyView ? { replyView } : {}),
      };
    } catch (error) {
      return {
        restored: false,
        reason: error.scanReason ?? 'document-changed',
        ...(this.reply
          ? {
              replyView: {
                state: 'unavailable',
                chat: this.reply.chat,
                messageId: this.reply.messageId,
              },
            }
          : {}),
      };
    }
  }

  async run(work) {
    await this.open();
    this.page.on('framenavigated', this.navigated);
    this.page.on('framedetached', this.invalidate);
    this.page.on('close', this.invalidate);
    try {
      return await withInactiveBrowserView(
        this.adapter,
        async (inactive, token) => {
          this.inactiveToken = token;
          await this.admitHistory();
          await this.view('open');
          let result;
          try {
            result = await work({
              document: this.adapter,
              visit: (chat, read) => this.visit(chat, read),
              verifyCurrent: inactive,
              inactiveToken: token,
              retainReply: (receipt) => {
                const reply = browserTextReceipt(receipt, {
                  source: this.ui.id,
                  chat: this.originalTarget,
                  text: receipt?.text,
                });
                if (reply) {
                  this.reply = reply;
                }
              },
            });
          } finally {
            this.restoration = await this.restore();
            this.trace('restore', this.restoration.reason);
            await this.original.frame
              .evaluate(browserChatViewState, {
                operation: 'release',
                token: this.token,
              })
              .catch(() => {});
          }
          return { ...result, restoration: this.restoration };
        },
        { relayOwner: true }
      );
    } catch (error) {
      this.trace('failed', error.scanReason ?? error.code);
      throw Object.assign(error, { restoration: this.restoration });
    } finally {
      this.page.off('framenavigated', this.navigated);
      this.page.off('framedetached', this.invalidate);
      this.page.off('close', this.invalidate);
      try {
        if (this.restoration.restored) {
          await this.historyTail?.retain(this.position);
        }
      } catch {
        // A closed or changed view cannot retain permission for another pass.
      } finally {
        await this.historyTail?.release();
        await this.historySession?.detach().catch(() => {});
      }
    }
  }
}

/** Existing same-document SPA views only. No launch, goto, reload or focus transfer. */
export const withBrowserChatNavigation = (options, work) =>
  new ChatNavigation(options).run(work);
