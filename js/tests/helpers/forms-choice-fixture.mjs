import { EventEmitter } from 'node:events';
import { createMemoryStore } from '../../src/storage/universal.js';
import { createFormReader } from '../../src/forms/reader.js';
import { seedFormAnswers } from '../../../experiments/issue-56/forms-plan-fixture.mjs';

export const formChoiceEnvironment = async () => {
  const store = createMemoryStore();
  const profile = await seedFormAnswers(store);
  const field = {
    id: 'frame-1:field-1',
    frame: 'frame-1',
    index: 0,
    tag: 'input',
    type: 'combobox',
    label: 'Preferred language',
    labelSource: 'aria-label',
    value: 'hi',
    displayValue: 'Hindi',
    checked: null,
    required: false,
    disabled: false,
    readOnly: false,
    valueOmitted: null,
    optionsComplete: true,
    optionsExpanded: false,
    optionsDisclosure: true,
    options: ['Hindi', 'English'].map((label, index) => ({
      label,
      value: index ? 'en' : 'hi',
      index,
      disabled: false,
      selected: index === 0,
      visible: false,
      clickable: true,
    })),
  };
  const report = {
    ok: true,
    version: 1,
    mode: 'read-only',
    targetLifetime: 'snapshot-only',
    scope: 'visible-current-pages',
    coverage: 'inspected',
    url: 'https://example.test/choices',
    title: 'Choices',
    capturedAt: '2026-11-10T16:00:00Z',
    omissions: [],
    frames: [
      {
        id: 'frame-1',
        parent: null,
        url: 'https://example.test/choices',
        reasons: [],
      },
    ],
    fields: [field],
  };
  const hooks = {};
  let clicks = 0;
  let disposed = 0;
  const page = new EventEmitter();
  page.isClosed = () => false;
  const options = {
    store,
    availability: async () => ({ available: true }),
    openSession: async () => ({
      page,
      commander: { goto: async () => {} },
      close: async () => page.emit('close'),
    }),
    review: {
      prefill: {
        inspect: async (_browser, input) => {
          input?.check?.();
          input?.onSnapshot?.({});
          await hooks.inspect?.();
          return globalThis.structuredClone(report);
        },
        capture: async () => ({
          check: async () => hooks.check?.(),
          dispose: async () => {
            disposed++;
          },
          control: () => ({
            click: async () => {
              clicks++;
              if (hooks.click) {
                return hooks.click();
              }
              field.optionsExpanded = true;
              field.optionsDisclosure = false;
              for (const option of field.options) {
                option.visible = true;
              }
            },
          }),
        }),
      },
    },
  };
  const reader = createFormReader(options);
  const opened = await reader.openReview({ url: report.url });
  const plan = () =>
    reader.planReview({ id: opened.session.id, profileId: profile.id });
  const disclose = (proposed) =>
    reader.discloseReview({
      id: opened.session.id,
      planId: proposed.reviewPlan.id,
      fieldId: field.id,
    });
  return {
    reader,
    options,
    profile,
    report,
    field,
    hooks,
    plan,
    disclose,
    get clicks() {
      return clicks;
    },
    get disposed() {
      return disposed;
    },
  };
};
