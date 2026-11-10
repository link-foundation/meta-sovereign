import { formFailure as failure } from './options.js';
import { formDocumentIdentity } from './read-document.js';
import { reviewTargetFields } from './review-radio.js';
import {
  customReviewField,
  customChoice,
  customOptionAtIndex,
  customOptionBound,
  expandableReviewField,
} from './review-custom.js';

export const reviewSnapshotKey = (report) =>
  JSON.stringify([report.url, report.title, report.fields, report.frames]);

const nativeReviewInput = (field) =>
  field.tag === 'input' &&
  ([
    'text',
    'search',
    'email',
    'url',
    'tel',
    'number',
    'date',
    'checkbox',
  ].includes(field.type) ||
    (field.type === 'radio' &&
      field.answer.proposal.checked === true &&
      field.answer.radioPeers?.length > 0));

export const writableReviewField = (field) => {
  if (
    !field.answer?.proposal ||
    field.disabled ||
    field.readOnly ||
    field.indeterminate ||
    field.valueOmitted
  ) {
    return false;
  }
  return (
    (field.tag === 'select' &&
      !field.multiple &&
      field.options.filter(
        (option) => option.value === field.answer.proposal.value
      ).length === 1) ||
    field.tag === 'textarea' ||
    field.type === 'contenteditable' ||
    nativeReviewInput(field) ||
    customReviewField(field)
  );
};

const atIndex = (index) =>
  globalThis.document.querySelectorAll(
    'input,textarea,select,[role="textbox"],[role="combobox"],[role="checkbox"],[role="radio"],[role="listbox"],[contenteditable="true"]'
  )[index];
const stillBound = (node, index) =>
  node.isConnected &&
  node.ownerDocument.querySelectorAll(
    'input,textarea,select,[role="textbox"],[role="combobox"],[role="checkbox"],[role="radio"],[role="listbox"],[contenteditable="true"]'
  )[index] === node;

/** Private element handles bind this plan to these exact documents and controls. */
export const captureReviewTargets = async (snapshot, fields) => {
  const targets = new Map();
  const choices = new Map();
  const boundFields = reviewTargetFields(
    fields,
    (field) => writableReviewField(field) || expandableReviewField(field)
  );
  const dispose = async () => {
    for (const handle of targets.values()) {
      await handle.dispose().catch(() => {});
    }
    targets.clear();
    for (const handle of choices.values()) {
      await handle.dispose().catch(() => {});
    }
    choices.clear();
  };
  try {
    for (const field of boundFields) {
      const entry = [...snapshot.handles].find(
        ([, doc]) => doc.id === field.frame
      );
      const handle = await entry?.[0].evaluateHandle(atIndex, field.index);
      const element = handle?.asElement();
      if (!element) {
        await handle?.dispose();
        throw failure(
          'form-changed',
          'A reviewed control is no longer available.'
        );
      }
      targets.set(field.id, element);
      const option = customChoice(field);
      if (option) {
        const optionHandle = await entry[0].evaluateHandle(
          customOptionAtIndex,
          option.index
        );
        const optionElement = optionHandle.asElement();
        if (!optionElement) {
          await optionHandle.dispose();
          throw failure(
            'form-changed',
            'A reviewed option is no longer available.'
          );
        }
        choices.set(field.id, optionElement);
      }
    }
  } catch (error) {
    await dispose();
    throw error;
  }
  return {
    dispose,
    get: (id) => choices.get(id) ?? targets.get(id),
    control: (id) => targets.get(id),
    async check() {
      for (const [frame, previous] of snapshot.handles) {
        const current = await frame.evaluate(formDocumentIdentity);
        if (
          current.url !== previous.url ||
          current.documentTime !== previous.documentTime
        ) {
          throw failure(
            'form-changed',
            'A reviewed document has changed. Plan its current page again.'
          );
        }
      }
      for (const field of boundFields) {
        if (!(await targets.get(field.id).evaluate(stillBound, field.index))) {
          throw failure(
            'form-changed',
            'A reviewed control was replaced. Plan its current page again.'
          );
        }
        const option = customChoice(field);
        if (
          option &&
          !(await choices.get(field.id).evaluate(customOptionBound, {
            index: option.index,
            controlIndex: field.index,
          }))
        ) {
          throw failure(
            'form-changed',
            'A reviewed option was replaced or moved.'
          );
        }
      }
    },
  };
};

export const writeReviewTarget = async (browser, handle, field) => {
  const proposal = field.answer.proposal;
  if (
    customChoice(field) ||
    (field.tag !== 'input' && ['checkbox', 'radio'].includes(field.type))
  ) {
    await handle.click({ timeout: 5000 });
  } else if (field.tag === 'select') {
    // Commander has no selectOption or frame/element-targeted checkbox API.
    await handle.selectOption(proposal.value, { timeout: 5000 });
  } else if (['checkbox', 'radio'].includes(field.type)) {
    await handle.setChecked(proposal.checked, { timeout: 5000 });
  } else {
    await browser.commander.performFill({
      locatorOrElement: handle,
      text: proposal.value,
      simulateTyping: false,
      verify: false,
    });
  }
};
