import { readFormDocument, formFrameVisible } from './read-document.js';
import { observeFormDocument } from './monitor-document.js';
import { validateFormInspection } from './plan-validation.js';
import { formUrl } from './options.js';
import { observeFormLearning } from './monitor-learning-document.js';

const messageSize = (value) => {
  try {
    return JSON.stringify(value)?.length ?? Infinity;
  } catch {
    return Infinity;
  }
};

const frameVisible = async (frame, page) => {
  if (frame === page.mainFrame()) {
    return true;
  }
  for (let current = frame, depth = 0; current !== page.mainFrame(); depth++) {
    if (!current || depth >= 9) {
      return false;
    }
    const element = await current.frameElement();
    try {
      if (!(await element.evaluate(formFrameVisible))) {
        return false;
      }
    } finally {
      await element.dispose();
    }
    current = current.parentFrame();
  }
  return true;
};

const monitorReport = (snapshot, id, slot) => {
  const {
    fields,
    documentTime: _time,
    learning: _learning,
    ...document
  } = snapshot;
  const report = {
    ok: true,
    version: 1,
    mode: 'read-only',
    url: formUrl(document.url),
    title: document.title,
    capturedAt: new Date().toISOString(),
    scope: 'visible-current-pages',
    coverage: 'partial',
    targetLifetime: 'snapshot-only',
    browserSlot: slot,
    observation: 'passive-document-snapshot',
    navigation: document.navigation,
    // A document callback does not establish an atomic read of other frames.
    omissions: [{ reason: 'other-documents-not-sampled' }],
    frames: [{ ...document, id, parent: null, fieldCount: fields.length }],
    fields: fields.map(
      ({ answer: _answer, plannedAnswer: _prior, ...field }) => ({
        ...field,
        id: `${id}:${field.id}`,
        frame: id,
      })
    ),
  };
  return validateFormInspection(report);
};

/** Capture public reports without polling, DOM writes or live plan authority. */
export const createFormMonitor = async ({
  page,
  id,
  slot,
  enabled = true,
  capture,
  trace,
  observed,
  incomplete,
  initializeCurrent = false,
}) => {
  const status = {
    state: enabled ? 'unavailable' : 'disabled',
    captured: 0,
    omitted: 0,
    failed: 0,
    learning: false,
  };
  let stopped = false;
  let pending = Promise.resolve();
  let queued = 0;
  let frameCount = 0;
  const frames = new WeakMap();
  const responses = new WeakMap();
  const response = (value) => {
    try {
      if (value.request().isNavigationRequest()) {
        responses.set(value.frame(), value.status());
      }
    } catch {
      /* Detached responses have no current document. */
    }
  };
  const failed = (error, invalid = true) => {
    status.failed++;
    if (invalid) {
      incomplete?.(error.code ?? 'capture-failed');
    }
    trace?.({ event: 'monitor-capture-failed', code: error.code ?? 'capture' });
  };
  const controls = {
    status: () => ({ ...status }),
    async stop() {
      stopped = true;
      page?.off?.('response', response);
      await pending;
      if (status.state === 'active') {
        status.state = 'stopped';
      }
    },
  };
  if (!enabled || !page?.exposeBinding || !page?.addInitScript) {
    return controls;
  }
  const binding = `__formMonitor_${id.replaceAll('-', '')}`;
  const receive = ({ frame }, snapshot) => {
    if (stopped) {
      return;
    }
    if (
      queued >= 8 ||
      snapshot?.omission === 'capture-size-limit' ||
      messageSize(snapshot) > 2 * 1024 ** 2
    ) {
      status.omitted++;
      incomplete?.('capture-omitted');
      return;
    }
    queued++;
    pending = pending
      .then(async () => {
        if (!(await frameVisible(frame, page))) {
          return;
        }
        if (!frames.has(frame)) {
          if (frameCount >= 10) {
            status.omitted++;
            incomplete?.('frame-limit');
            return;
          }
          frames.set(frame, `monitor-frame-${++frameCount}`);
        }
        const report = monitorReport(snapshot, frames.get(frame), slot);
        const captured = await capture(report);
        await observed?.(report, {
          ...snapshot.learning,
          documentTime: snapshot.documentTime,
          frame: frames.get(frame),
          responseStatus: responses.get(frame),
        });
        if (captured?.reportFile?.state === 'failed') {
          failed({ code: 'form-report-write' }, false);
        }
        status.captured++;
      })
      .catch(failed)
      .finally(() => {
        queued--;
      });
    return pending;
  };
  try {
    page.on?.('response', response);
    await page.exposeBinding(binding, receive);
    const content = `(${observeFormDocument.toString()})(${readFormDocument.toString()}, ${JSON.stringify(binding)}, ${observed ? observeFormLearning.toString() : 'undefined'});`;
    await page.addInitScript({ content });
    if (initializeCurrent) {
      for (const frame of page.frames()) {
        if (frame.url() !== 'about:blank') {
          await frame.evaluate(content);
        }
      }
    }
    status.state = 'active';
  } catch (error) {
    stopped = true;
    failed(error);
  }
  return controls;
};
