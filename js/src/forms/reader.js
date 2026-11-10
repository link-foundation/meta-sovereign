import { openBrowserSession, browserAvailability } from '../cv/browser.js';
import { browserName } from '../browser/policy.js';
import {
  readFormDocument,
  formDocumentIdentity,
  formFrameVisible,
} from './read-document.js';

const failure = (code, message) => Object.assign(new Error(message), { code });
export const formUrl = (value) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw failure('form-url', 'Enter an absolute HTTP or HTTPS form URL.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw failure(
      'form-url',
      'Use an HTTP or HTTPS form URL without embedded credentials.'
    );
  }
  return url.href;
};
const sameDocument = (a, b) =>
  a.url === b.url && a.documentTime === b.documentTime;

const readChildFrame = async (frame, parent, maxFields) => {
  let element;
  try {
    element = await frame.frameElement();
    if (!(await element.evaluate(formFrameVisible))) {
      return { omission: { reason: 'hidden-frame' } };
    }
    await frame.waitForLoadState?.('domcontentloaded', { timeout: 5000 });
    // Commander owns main-document reads. Its API has no frame target;
    // the connected Playwright frame also permits cross-origin child DOMs.
    const document = await frame.evaluate(readFormDocument, {
      maxFields,
      maxOptions: 100,
    });
    return { document: { parent, ...document } };
  } catch {
    return { omission: { reason: 'frame-unavailable' } };
  } finally {
    await element?.dispose?.();
  }
};

const readFrames = async (page, main, check) => {
  const frames = [{ id: 'frame-1', parent: null, ...main }];
  const omissions = [];
  const handles = new Map();
  const mainFrame = page?.mainFrame?.();
  if (mainFrame) {
    handles.set(mainFrame, frames[0]);
  }
  const children =
    page?.frames?.().filter((frame) => frame !== mainFrame) ?? [];
  let fieldCount = main.fields.length;
  let attemptedFrames = 0;
  for (const frame of children) {
    check();
    if (attemptedFrames++ >= 9 || fieldCount >= 200) {
      omissions.push({
        reason: attemptedFrames > 9 ? 'frame-limit' : 'field-limit',
      });
      break;
    }
    const parent = handles.get(frame.parentFrame?.());
    if (!parent) {
      omissions.push({ reason: 'parent-frame-unavailable' });
      continue;
    }
    const result = await readChildFrame(frame, parent.id, 200 - fieldCount);
    if (result.omission) {
      omissions.push(result.omission);
      continue;
    }
    const entry = { id: `frame-${frames.length + 1}`, ...result.document };
    frames.push(entry);
    handles.set(frame, entry);
    fieldCount += entry.fields.length;
  }
  return { frames, omissions, handles };
};

const assertCurrentDocuments = async (commander, handles, main) => {
  for (const [frame, document] of handles) {
    try {
      if (!sameDocument(document, await frame.evaluate(formDocumentIdentity))) {
        throw failure(
          'form-changed',
          'The form navigated during inspection. Read its current page again.'
        );
      }
    } catch (error) {
      throw error.code
        ? error
        : failure(
            'form-changed',
            'A form frame detached during inspection. Read its current page again.'
          );
    }
  }
  const current = await commander.evaluate({ fn: formDocumentIdentity });
  if (!sameDocument(main, current)) {
    throw failure(
      'form-changed',
      'The form navigated during inspection. Read its current page again.'
    );
  }
};

/** One snapshot, never clicks, fills, submits, or learns an answer. */
export const inspectFormSession = async (
  session,
  { url, check = () => {} } = {}
) => {
  const { commander, page } = session;
  await commander.goto({ url, waitUntil: 'domcontentloaded', timeout: 30000 });
  check();
  const main = await commander.evaluate({
    fn: readFormDocument,
    args: [{ maxFields: 200, maxOptions: 100 }],
  });
  check();
  const { frames, omissions, handles } = await readFrames(page, main, check);
  await assertCurrentDocuments(commander, handles, main);
  check();
  return {
    ok: true,
    version: 1,
    mode: 'read-only',
    url: main.url,
    title: main.title,
    capturedAt: new Date().toISOString(),
    scope: 'visible-current-pages',
    coverage:
      omissions.length || frames.some((frame) => frame.reasons.length)
        ? 'partial'
        : 'inspected',
    fields: frames.flatMap((frame) =>
      frame.fields.map((field) => ({
        ...field,
        id: `${frame.id}:${field.id}`,
        frame: frame.id,
      }))
    ),
    frames: frames.map(({ fields, documentTime: _documentTime, ...frame }) => ({
      ...frame,
      fieldCount: fields.length,
    })),
    omissions,
    // Snapshot indexes identify report rows, never durable fill targets.
    targetLifetime: 'snapshot-only',
  };
};

/** Own launch/read/close, including stop while a lazy browser launch is pending. */
export const createFormReader = ({
  store,
  openSession = openBrowserSession,
  availability = browserAvailability,
  deadlineMs = 60000,
} = {}) => {
  let active = null;
  let stopping = false;
  return {
    async capabilities() {
      const status = await availability();
      return {
        ...status,
        read: status.available,
        fill: false,
        submit: false,
        scope: 'visible-current-pages',
      };
    },
    async read(options = {}) {
      if (stopping) {
        throw failure('form-stopped', 'Form inspection is stopping.');
      }
      if (active) {
        throw failure('form-busy', 'Another form inspection is still running.');
      }
      const url = formUrl(options.url);
      const slot = browserName(options.browserSlot ?? 'forms');
      if (
        options.headless !== undefined &&
        typeof options.headless !== 'boolean'
      ) {
        throw failure('form-options', 'headless must be a boolean.');
      }
      let session;
      let closing;
      let cancelled = false;
      let expired = false;
      const close = () =>
        session
          ? (closing ??= Promise.resolve().then(() => session.close()))
          : Promise.resolve();
      const check = () => {
        if (expired) {
          throw failure(
            'form-timeout',
            'Form inspection reached its time limit. Read the current page again.'
          );
        }
        if (cancelled || stopping) {
          throw failure(
            'form-stopped',
            'Form inspection stopped before a snapshot was completed.'
          );
        }
      };
      const task = {
        cancel: () => {
          cancelled = true;
          return close();
        },
      };
      active = task;
      const timer = globalThis.setTimeout(() => {
        expired = true;
        close().catch(() => {});
      }, deadlineMs);
      timer.unref?.();
      task.done = (async () => {
        try {
          session = await openSession({
            store,
            platform: 'shared',
            useCase: 'forms',
            slot,
            headless: options.headless,
          });
          check();
          return {
            ...(await inspectFormSession(session, { url, check })),
            browserSlot: slot,
            policy: session.policy ?? null,
          };
        } catch (error) {
          check();
          throw error;
        } finally {
          try {
            await close();
          } finally {
            globalThis.clearTimeout(timer);
          }
        }
      })();
      try {
        return await task.done;
      } finally {
        if (active === task) {
          active = null;
        }
      }
    },
    async stop() {
      stopping = true;
      const task = active;
      if (task) {
        await Promise.allSettled([task.cancel(), task.done]);
      }
    },
  };
};
