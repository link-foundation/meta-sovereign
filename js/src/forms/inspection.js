import { formFailure as failure, formUrl } from './options.js';
import {
  readFormDocument,
  formDocumentIdentity,
  formFrameVisible,
} from './read-document.js';

const sameDocument = (a, b) =>
  a.url === b.url && a.documentTime === b.documentTime;
const identity = ({ url, documentTime }) => ({ url, documentTime });

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

const assertCurrentDocuments = async (commander, handles, main, trace) => {
  for (const [frame, document] of handles) {
    try {
      const current = await frame.evaluate(formDocumentIdentity);
      if (!sameDocument(document, current)) {
        trace?.({
          event: 'document-changed',
          frame: document.id,
          previous: identity(document),
          current: identity(current),
        });
        throw failure(
          'form-changed',
          'The form navigated during inspection. Read its current page again.'
        );
      }
    } catch (error) {
      trace?.({
        event: 'document-check-failed',
        frame: document.id,
        code: error.code ?? 'frame-unavailable',
      });
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
    trace?.({
      event: 'document-changed',
      frame: 'commander',
      previous: identity(main),
      current: identity(current),
    });
    throw failure(
      'form-changed',
      'The form navigated during inspection. Read its current page again.'
    );
  }
};

/** One snapshot, never clicks, fills, submits, or learns an answer. */
export const inspectCurrentFormSession = async (
  session,
  { check = () => {}, onSnapshot, trace = session.trace } = {}
) => {
  const { commander, page } = session;
  check();
  const main = await commander.evaluate({
    fn: readFormDocument,
    args: [{ maxFields: 200, maxOptions: 100 }],
  });
  formUrl(main.url);
  check();
  const { frames, omissions, handles } = await readFrames(page, main, check);
  await assertCurrentDocuments(commander, handles, main, trace);
  check();
  onSnapshot?.({ frames, handles });
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
    navigation: {
      nextPage: frames.some((frame) => frame.navigation?.nextPage),
      limited: frames.some((frame) => frame.navigation?.limited),
    },
    frames: frames.map(({ fields, documentTime: _documentTime, ...frame }) => ({
      ...frame,
      fieldCount: fields.length,
    })),
    omissions,
    // Snapshot indexes identify report rows, never durable fill targets.
    targetLifetime: 'snapshot-only',
  };
};

export const inspectFormSession = async (
  session,
  { url, check = () => {} } = {}
) => {
  await session.commander.goto({
    url,
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  return inspectCurrentFormSession(session, { check });
};
