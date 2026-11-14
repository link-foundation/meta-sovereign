import {
  applicationFailure as fail,
  applicationView,
  applicationDelay,
} from './application-options.js';
import {
  applicationSelectors,
  applicationDocument,
} from './application-page.js';
import { resumeHash, resumeList, resumeListId } from './resume-list.js';
import { withResumeLanguages } from './resume-language-files.js';
import { ApplicationContextChoice } from './application-context-choice.js';
import { applicationResumePreference } from './application-resume-preference.js';

export const applicationResumeSelector = (hash) =>
  `[role="option"][data-qa="magritte-select-option-${resumeHash(hash)}"]`;

export const dispatchResumeChoice = (handle, record, hash) =>
  handle.evaluate(applicationDocument, {
    url: record.url,
    selectors: {
      ...applicationSelectors,
      resumeChoice: applicationResumeSelector(hash),
    },
    action: 'resumeChoice',
    resume: hash,
    guard: record.guard.page,
  });

const readyChooser = (record) => {
  const chooser = record.page.resumeChooser;
  if (
    record.state !== 'review' ||
    record.attempted.submit ||
    record.delivery !== 'none' ||
    !record.page.scope ||
    !chooser ||
    chooser.ambiguous ||
    chooser.disabled
  ) {
    throw fail('state');
  }
  return chooser;
};
const observedChoice = (chooser, input) => {
  const hash = resumeHash(input.resume);
  const desired = chooser.options.find(
    (row) => row.hash === hash && !row.disabled
  );
  if (
    !chooser.open ||
    !desired ||
    chooser.options.filter((row) => row.title === desired.title).length !== 1
  ) {
    throw fail('resume');
  }
  return desired;
};

/** Explicit reversible form choice. No entry, answer fill or submission is issued. */
export class ApplicationResumes {
  constructor(service) {
    this.service = service;
    this.context = new ApplicationContextChoice(this);
  }
  ready(record) {
    return readyChooser(record);
  }
  async list(record) {
    const { store } = this.service;
    const id = resumeListId(record.browserSlot);
    const raw = await store.get(id);
    if (raw?.id !== id || raw.version !== 1) {
      throw fail('resume-export');
    }
    return resumeList(raw, record.browserSlot);
  }
  async proof(record, hash, title, signal) {
    const { store, artifactRoot } = this.service;
    const list = await this.list(record);
    const entry = list.entries.find(
      (row) => row.hash === hash && row.title === title
    );
    if (!entry) {
      throw fail('resume-export');
    }
    const checked = await withResumeLanguages(
      { store, artifactRoot },
      { ...list, entries: [entry] },
      signal
    );
    if (!checked.entries[0].languageProof) {
      throw fail('resume-export');
    }
    return checked.entries[0].languageProof;
  }
  async settle(record, predicate, signal) {
    for (let attempt = 0; attempt < 20; attempt++) {
      signal.throwIfAborted();
      const page = await this.service.readPage(record.browser, record.url);
      if (predicate(page)) {
        return this.service.review.inspect(record, signal);
      }
      await applicationDelay(100, signal);
    }
    throw fail('resume');
  }
  async click(record, action, signal, predicate, hash) {
    const service = this.service;
    await service.review.check(record, 'submit', signal);
    const selector =
      action === 'resumeMenu'
        ? applicationSelectors.resumeMenu
        : applicationResumeSelector(hash);
    const handle = await service.target(record.browser.page, selector);
    if (!handle) {
      throw fail('changed');
    }
    try {
      signal.throwIfAborted();
      const result =
        action === 'resumeMenu'
          ? await service.dispatch(handle, record, action)
          : await service.selectResume(handle, record, hash);
      if (result?.dispatched !== true) {
        throw fail('unconfirmed');
      }
      return await this.settle(record, predicate, signal);
    } finally {
      await handle.dispose();
    }
  }
  async change(record, input, signal) {
    if (input.confirm !== true) {
      throw fail('confirmation');
    }
    if (!['menu', 'choose', 'context'].includes(input.action)) {
      throw fail('input');
    }
    const chooser = readyChooser(record);
    if (input.action === 'context') {
      return this.context.change(record, signal);
    }
    const desired =
      input.action === 'choose' ? observedChoice(chooser, input) : null;
    const languageProof = desired
      ? await this.proof(record, desired.hash, desired.title, signal)
      : null;
    await this.service.review.check(record, 'submit', signal);
    if (record.options.testMode) {
      return applicationView({ ...record, state: 'test-preview' });
    }
    this.service.trace({
      event: 'application-resume-choice',
      action: input.action,
    });
    return input.action === 'menu'
      ? this.menu(record, chooser, signal)
      : this.choose(record, desired, languageProof, signal);
  }
  async menu(record, chooser, signal) {
    const result = await this.click(
      record,
      'resumeMenu',
      signal,
      (page) =>
        page.documentKey === record.page.documentKey &&
        page.resumeChooser?.open === !chooser.open
    );
    if (record.page.resumeChooser?.open === chooser.open) {
      throw fail('resume');
    }
    return result;
  }
  async remember(record, desired, source) {
    record.resumePreference = applicationResumePreference({
      hash: desired.hash,
      title: desired.title,
      source,
    });
    await this.service.save(record);
  }
  async choose(record, desired, languageProof, signal, source = 'manual') {
    const documentKey = record.page.documentKey;
    if (!desired.checked) {
      await this.click(
        record,
        'resumeChoice',
        signal,
        (page) =>
          page.documentKey === documentKey &&
          (page.resumeChooser?.open
            ? page.resumeChooser.options.some(
                (row) => row.hash === desired.hash && row.checked
              )
            : page.resumeChooser?.title === desired.title),
        desired.hash
      );
    }
    const current = record.page.resumeChooser;
    if (
      !current ||
      current.ambiguous ||
      record.page.documentKey !== documentKey ||
      (current.open &&
        !current.options.some(
          (row) => row.hash === desired.hash && row.checked
        ))
    ) {
      throw fail('resume');
    }
    if (current.open) {
      await this.click(
        record,
        'resumeMenu',
        signal,
        (page) =>
          page.documentKey === documentKey && page.resumeChooser?.open === false
      );
    }
    const after = record.page.resumeChooser;
    if (
      !after ||
      after.open ||
      after.title !== desired.title ||
      record.page.documentKey !== documentKey
    ) {
      throw fail('resume');
    }
    await this.remember(record, desired, source);
    return {
      ...applicationView(record),
      resumeSelection: {
        hash: desired.hash,
        title: desired.title,
        languageProof,
      },
    };
  }
}
