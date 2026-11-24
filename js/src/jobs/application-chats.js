import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createBrowserSender } from '../sources/browser-sender.js';
import { createQuestionBrowser } from '../automation/question-browser.js';
import {
  unreadSkipTarget,
  sameUnreadSkip,
} from '../automation/question-unread-polling-state.js';
import { createWatcherControl } from '../forms/watcher-rpc.js';
import { spawnWorker } from '../server/worker-client.js';
import { createLocalAnswerModel } from '../automation/local-answer-model.js';
import { jobBrowserProfile } from './browser-profile.js';
import { reuseApplicationChatSession } from './application-chat-session.js';
import { jobsFailure } from './options.js';

const skipChanged = () =>
  jobsFailure(
    'application-chats-skip-changed',
    'Refresh the held chat before skipping.'
  );

/** The child supervises polling; browser effects retain the parent's canonical writer. */
export class ApplicationChats {
  constructor({
    store,
    openSession,
    storeDir,
    runner,
    prefillLinkedForm,
    log = () => {},
    sender = createBrowserSender,
    questions = createQuestionBrowser,
    spawn = spawnWorker,
  }) {
    Object.assign(this, {
      store,
      openSession,
      storeDir,
      runner,
      prefillLinkedForm,
      log,
      sender,
      questions,
      spawn,
    });
  }
  status() {
    return globalThis.structuredClone(this.view);
  }
  async start(record, { applicationPage, allowAutomaticReuse } = {}) {
    this.controller = new AbortController();
    this.view = {
      phase: 'starting',
      active: true,
      pid: null,
      passId: record.chatPassId,
      browserSlot: record.options.chatBrowserSlot,
      code: null,
      held: null,
    };
    this.record = record;
    this.applicationPage = applicationPage;
    this.allowAutomaticReuse = allowAutomaticReuse;
    const token = randomBytes(32).toString('hex');
    try {
      this.control = await createWatcherControl({
        token,
        timeoutMs: 180000,
        dispatch: (operation) => this.request(operation),
      });
      this.child = this.spawn({
        entry: fileURLToPath(
          new URL('../../bin/application-chats-worker.js', import.meta.url)
        ),
        log: (entry) => this.log(entry),
      });
      this.view.pid = this.child.pid;
      this.child.onExit(() => {
        if (!this.closing) {
          this.refuse('jobs-application-chats-child-exited');
          void this.close().catch(() => {});
        }
      });
      await this.child.call('init', { port: this.control.port, token });
    } catch (error) {
      this.refuse(error.code ?? 'jobs-application-chats-start');
      await this.close();
    }
    return this;
  }
  refuse(code) {
    Object.assign(this.view, { phase: 'refused', active: false, code });
    if (this.view.skip) {
      this.view.skip = null;
    }
    this.log({ event: 'application-chats-refused', code });
  }
  async request(operation) {
    if (operation === 'stop') {
      await this.drain();
    } else if (operation === 'start' && !this.preparing && !this.closing) {
      this.preparing = this.prepare().catch((error) => {
        if (!this.controller.signal.aborted) {
          this.refuse(error.code ?? 'jobs-application-chats-unavailable');
        }
      });
    } else if (operation !== 'status') {
      throw new Error('Unsupported application chat control.');
    }
    if (this.browser && this.view.phase === 'running') {
      const receipt = await this.browser.unreadStatus({ id: this.view.passId });
      this.observe(receipt);
    }
    return this.status();
  }
  observe(receipt) {
    const waiting = this.record.options.chatWatchWaiting;
    if (waiting && !this.observeWaiting(receipt)) {
      return;
    }
    if (this.closing || this.view.phase !== 'running') {
      return;
    }
    const held = receipt.restoration?.heldReview;
    this.view.held = held
      ? {
          chat: held.chat,
          title: (held.title ?? held.chat).slice(0, 1200),
          url: held.url ?? null,
        }
      : null;
    if (waiting) {
      this.view.skip = unreadSkipTarget(receipt);
    }
    if (!receipt.owned || receipt.state !== 'active') {
      this.refuse(
        receipt.code ?? receipt.polling?.reason ?? 'question-unread-ended'
      );
    }
  }
  observeWaiting(receipt) {
    const { passes, lastSkip } = receipt.polling ?? {};
    if (passes !== undefined && passes < this.observedPasses) {
      return false;
    }
    this.observedPasses = passes ?? this.observedPasses;
    if (lastSkip) {
      this.view.lastSkip = lastSkip;
    }
    return true;
  }
  applicationDelivered() {
    if (this.record.options.chatWatchWaiting && this.view.active) {
      this.delivered = true;
      if (this.view.phase === 'running') {
        this.browser.unreadRefresh({ id: this.view.passId });
      }
    }
  }
  async reviewPending() {
    if (!this.delivered) {
      return false;
    }
    await this.request('status');
    return (
      this.view.active &&
      (this.view.phase === 'starting' ||
        this.browser.unreadRefreshPending({ id: this.view.passId }))
    );
  }
  async skip(input) {
    const { passId: id } = this.view;
    if (id === input.id && sameUnreadSkip(this.view.lastSkip, input)) {
      return;
    }
    if (this.closing || this.view.phase !== 'running' || id !== input.id) {
      throw skipChanged();
    }
    const receipt = await this.browser.unreadSkip(input);
    const lastSkip = receipt.polling?.lastSkip;
    if (!sameUnreadSkip(lastSkip, input)) {
      throw skipChanged();
    }
    this.observe(receipt);
  }
  async prepare() {
    const { options } = this.record;
    const signal = this.controller.signal;
    this.send = this.sender({
      store: this.store,
      openSession: this.openSession,
      slot: options.chatBrowserSlot,
      resolveProfileDir: () =>
        jobBrowserProfile({
          storeDir: this.storeDir,
          browserSlot: options.chatBrowserSlot,
        }),
    });
    const prepared = await this.send.prepareUnreadConversations({
      source: 'hh',
      signal,
      authenticate: (destination) =>
        reuseApplicationChatSession({
          applicationPage: this.applicationPage,
          destination,
          signal,
        }),
    });
    signal.throwIfAborted();
    if (prepared?.sessionReused) {
      this.log({
        event: 'application-chats-session-reused',
        browserSlot: options.chatBrowserSlot,
      });
    }
    this.model =
      options.chatModelDraft && !this.runner ? createLocalAnswerModel() : null;
    this.browser = this.questions({
      store: this.store,
      send: Object.assign(this.send.send.bind(this.send), this.send),
      runner: this.runner ?? this.model?.draft,
      prefillLinkedForm: this.prefillLinkedForm,
      allowAutomaticReuse: this.allowAutomaticReuse,
      log: this.log,
    });
    await this.browser.unreadStart({
      id: this.view.passId,
      source: 'hh',
      confirm: true,
      answerChats: true,
      reviewChoices: true,
      rejectionsFirst: true,
      ...(options.review.autoReuseAnswers ? { autoReuseAnswers: true } : {}),
      ...(options.chatWatchWaiting ? { watchWaiting: true } : {}),
      ...(options.chatPrefillForms ? { prefillForms: true } : {}),
      ...(options.chatPrefillForms || options.review.autoReuseAnswers
        ? {
            profileId: options.review.profileId,
            salary: options.review.salary,
            ...(options.review.answerFinalPeriod === undefined
              ? {}
              : { answerFinalPeriod: options.review.answerFinalPeriod }),
          }
        : {}),
      modelDraft: options.chatModelDraft,
      polling: {
        intervalMs: options.chatsIntervalMinutes * 60000,
        durationMs: options.durationMs,
      },
    });
    signal.throwIfAborted();
    this.view.phase = 'running';
    if (this.delivered) {
      this.browser.unreadRefresh({ id: this.view.passId });
    }
  }
  drain() {
    return (this.draining ??= (async () => {
      this.controller.abort();
      await this.preparing;
      try {
        await this.browser?.close();
      } finally {
        try {
          await this.model?.stop();
        } finally {
          await this.send?.close();
          this.view.active = false;
          if (this.view.skip) {
            this.view.skip = null;
          }
          if (this.view.phase !== 'refused') {
            this.view.phase = 'stopped';
          }
        }
      }
    })());
  }
  close() {
    return (this.closing ??= (async () => {
      // Signal browser work before waiting for the child's in-flight status RPC.
      this.controller.abort();
      try {
        await this.child?.close();
      } catch (error) {
        this.refuse(error.code ?? 'jobs-application-chats-stop');
        await this.child?.discard();
      } finally {
        try {
          await this.drain();
        } finally {
          await this.control?.close();
        }
      }
    })());
  }
}
