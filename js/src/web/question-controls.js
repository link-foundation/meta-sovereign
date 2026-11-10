import React from 'react';
import { useT } from './i18n.js';
import { ProfileFields } from './question-profile-fields.js';
import { SalaryFields } from './question-salary-fields.js';
import {
  AnswerContextFields,
  AnswerEnvironmentFields,
} from './question-context-fields.js';
import { blankAutomation } from './automations-model.js';
import { AnswerEvidence } from './question-evidence.js';
import { AnswerPolicyControls } from './question-policy.js';

const el = React.createElement;
const isOpening = (event) =>
  event.target === event.currentTarget && event.currentTarget.open;
const csv = (value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
const blank = () => ({
  id: '',
  question: '',
  questions: [],
  sources: [],
  chats: [],
  enabled: true,
  answers: [{ text: '', count: 0, approved: false, evidence: [] }],
});
const Field = ({ label, value, change, rows, ...props }) =>
  el('label', { className: 'field' }, [
    el('span', { key: 'l', className: 'field-label' }, label),
    el(rows ? 'textarea' : 'input', {
      key: 'c',
      'aria-label': label,
      value,
      rows,
      onChange: (event) => change(event.target.value),
      ...props,
    }),
  ]);

const AnswerVariant = ({
  variant,
  index,
  disabled,
  change,
  remove,
  canRemove,
}) => {
  const t = useT();
  return el('fieldset', { className: 'col' }, [
    el('legend', { key: 'l' }, t('questions.variant', { count: index + 1 })),
    el(Field, {
      key: 't',
      label: t('questions.answer'),
      value: variant.text,
      change: (text) => change({ text }),
      rows: 4,
      required: true,
      maxLength: 12000,
    }),
    el('label', { key: 'a', className: 'check' }, [
      el('input', {
        key: 'i',
        type: 'checkbox',
        checked: variant.approved,
        onChange: (event) => change({ approved: event.target.checked }),
      }),
      ` ${t('questions.approved')}`,
    ]),
    el('label', { key: 'canonical', className: 'check' }, [
      el('input', {
        key: 'i',
        type: 'checkbox',
        checked: variant.canonical === true,
        onChange: (event) => change({ canonical: event.target.checked }),
      }),
      ` ${t('questions.canonical')}`,
    ]),
    el(
      'small',
      { key: 'f', className: 'meta' },
      t('questions.frequency', { count: variant.count })
    ),
    variant.evidence?.length
      ? el('details', { key: 'e' }, [
          el('summary', { key: 's' }, t('questions.evidence')),
          el(
            'ul',
            { key: 'l' },
            variant.evidence.map((id) => el('li', { key: id }, id))
          ),
        ])
      : null,
    canRemove
      ? el(
          'button',
          {
            key: 'r',
            type: 'button',
            disabled,
            onClick: remove,
          },
          t('questions.removeVariant')
        )
      : null,
  ]);
};

const RuleEditor = ({ rule, set, disabled, save, remove }) => {
  const t = useT();
  const answer = (index, patch) =>
    set({
      ...rule,
      answers: rule.answers.map((entry, at) =>
        at === index ? { ...entry, ...patch } : entry
      ),
    });
  return el(
    'form',
    {
      className: 'col',
      'data-answer-rule': true,
      onSubmit: (event) => {
        event.preventDefault();
        save();
      },
    },
    [
      el(Field, {
        key: 'q',
        label: t('questions.question'),
        value: rule.question,
        change: (question) => set({ ...rule, question }),
        rows: 3,
        required: true,
        maxLength: 6000,
      }),
      el('label', { key: 'enabled', className: 'check' }, [
        el('input', {
          key: 'i',
          type: 'checkbox',
          checked: rule.enabled,
          onChange: (event) => set({ ...rule, enabled: event.target.checked }),
        }),
        ` ${t('questions.enabled')}`,
      ]),
      el(Field, {
        key: 'aliases',
        label: t('questions.aliases'),
        value: rule.questionsText ?? (rule.questions ?? []).join('\n'),
        rows: 3,
        change: (value) =>
          set({
            ...rule,
            questions: value.split('\n').filter((line) => line.trim()),
            questionsText: value,
          }),
      }),
      ...rule.answers.map((variant, index) =>
        el(AnswerVariant, {
          key: index,
          variant,
          index,
          disabled,
          change: (patch) => answer(index, patch),
          canRemove: rule.answers.length > 1,
          remove: () =>
            set({
              ...rule,
              answers: rule.answers.filter((_, at) => at !== index),
            }),
        })
      ),
      el(
        'button',
        {
          key: 'add',
          type: 'button',
          disabled: disabled || rule.answers.length >= 100,
          onClick: () =>
            set({
              ...rule,
              answers: [
                ...rule.answers,
                { text: '', count: 0, approved: false, evidence: [] },
              ],
            }),
        },
        t('questions.addVariant')
      ),
      el(Field, {
        key: 's',
        label: t('questions.sources'),
        value: rule.sourcesText ?? rule.sources.join(', '),
        change: (value) =>
          set({ ...rule, sources: csv(value), sourcesText: value }),
      }),
      el(Field, {
        key: 'c',
        label: t('questions.chats'),
        value: rule.chatsText ?? rule.chats.join(', '),
        change: (value) =>
          set({ ...rule, chats: csv(value), chatsText: value }),
      }),
      el('div', { key: 'actions', className: 'row' }, [
        el(
          'button',
          { key: 'save', type: 'submit', disabled, className: 'primary' },
          t('common.save')
        ),
        rule.id
          ? el(
              'button',
              { key: 'delete', type: 'button', disabled, onClick: remove },
              t('automations.delete')
            )
          : null,
      ]),
    ]
  );
};

const AnswerPreview = ({ result }) => {
  const t = useT();
  if (!result) {
    return null;
  }
  return el('div', { className: 'col', 'data-answer-preview': true }, [
    el(AnswerEvidence, { key: 'evidence', answer: result }),
    el('p', { key: 'r', className: 'meta' }, t('automations.plan.nothingSent')),
    el(
      'pre',
      {
        key: 'text',
        style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
      },
      result.text ||
        t(result.noReply ? 'questions.noReply' : 'questions.noAnswer')
    ),
  ]);
};

const LearnedAnswers = ({ busy, learned, learn }) => {
  const t = useT();
  return el('details', { key: 'learn' }, [
    el('summary', { key: 's' }, t('questions.learn')),
    el('p', { key: 'h', className: 'meta' }, t('questions.learnHint')),
    el(
      'button',
      {
        key: 'preview',
        type: 'button',
        disabled: busy,
        onClick: () => learn(false),
      },
      t('questions.previewLearning')
    ),
    learned
      ? el('div', { key: 'results', className: 'col' }, [
          el(
            'p',
            { key: 'coverage' },
            t('questions.coverage', {
              retained: learned.coverage.retained,
              seen: learned.coverage.seen,
            })
          ),
          learned.coverage.limited
            ? el(
                'p',
                { key: 'limit', className: 'meta' },
                t('questions.partialHistory')
              )
            : null,
          el(
            'ul',
            { key: 'list' },
            learned.rules.map((entry) =>
              el('li', { key: entry.id }, [
                el('strong', { key: 'question' }, entry.question),
                ...entry.answers.map((answer, index) =>
                  el('div', { key: index }, [
                    el(
                      'small',
                      { key: 'count', className: 'meta' },
                      t('questions.frequency', { count: answer.count })
                    ),
                    el(
                      'pre',
                      {
                        key: 'text',
                        style: {
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'anywhere',
                        },
                      },
                      answer.text
                    ),
                  ])
                ),
              ])
            )
          ),
          !learned.applied && learned.rules.length
            ? el(
                'button',
                {
                  key: 'apply',
                  type: 'button',
                  disabled: busy,
                  onClick: () => learn(true),
                },
                t('questions.applyLearning')
              )
            : null,
        ])
      : null,
  ]);
};

const PreviewControls = ({
  busy,
  api,
  run,
  profile,
  setProfile,
  profileId,
  setProfileId,
  contexts,
  setContexts,
  salary,
  setSalary,
}) => {
  const t = useT();
  const [question, setQuestion] = React.useState('');
  const [source, setSource] = React.useState('');
  const [chat, setChat] = React.useState('');
  const [result, setResult] = React.useState(null);
  const [environment, setEnvironment] = React.useState({});
  return el('details', { key: 'preview' }, [
    el('summary', { key: 's' }, t('questions.preview')),
    el(Field, {
      key: 'q',
      label: t('questions.question'),
      value: question,
      change: setQuestion,
      rows: 3,
      maxLength: 6000,
    }),
    el('div', { key: 'scope', className: 'row' }, [
      el(Field, {
        key: 's',
        label: t('questions.previewSource'),
        value: source,
        change: setSource,
      }),
      el(Field, {
        key: 'c',
        label: t('questions.previewChat'),
        value: chat,
        change: setChat,
      }),
    ]),
    el(ProfileFields, {
      key: 'p',
      profile,
      set: setProfile,
      profileId,
      setProfileId,
      api,
      disabled: busy,
    }),
    el(AnswerContextFields, { key: 'contexts', contexts, set: setContexts }),
    el(SalaryFields, { key: 'salary', salary, set: setSalary, api }),
    el(AnswerEnvironmentFields, {
      key: 'environment',
      environment,
      set: setEnvironment,
    }),
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        disabled: busy || !question.trim(),
        onClick: () =>
          run(async () =>
            setResult(
              await api.previewAnswer({
                question,
                source,
                chat,
                profile,
                profileId,
                contexts,
                salary,
                recent: (environment.recentText ?? '')
                  .split('\n')
                  .filter((line) => line.trim()),
                vacancy: environment.vacancy,
              })
            )
          ),
      },
      t('questions.preview')
    ),
    el(AnswerPreview, { key: 'r', result }),
  ]);
};

const questionAutomation = (t, profile, contexts, salary, profileId) => ({
  ...blankAutomation(t('questions.automationName')),
  conditions: {
    silentDays: 0,
    cooldownDays: 0,
    mutual: false,
    personal: false,
    lastFrom: 'contact',
  },
  action: { kind: 'answer-questions', profile, profileId, contexts, salary },
});

const QuestionToolbar = ({ busy, create, refresh, newRule }) => {
  const t = useT();
  return el('div', { className: 'row' }, [
    el(
      'button',
      { key: 'new', type: 'button', disabled: busy, onClick: newRule },
      t('questions.new')
    ),
    el(
      'button',
      { key: 'refresh', type: 'button', disabled: busy, onClick: refresh },
      t('questions.refresh')
    ),
    el(
      'button',
      { key: 'auto', type: 'button', disabled: busy, onClick: create },
      t('questions.createAutomation')
    ),
  ]);
};

const ContractControl = ({ value, set, busy }) => {
  const t = useT();
  return el('div', { className: 'col' }, [
    el('label', { key: 'label', className: 'row' }, [
      el('input', {
        key: 'input',
        type: 'checkbox',
        checked: value,
        disabled: busy,
        onChange: (event) => set(event.target.checked),
      }),
      t('questions.contract'),
    ]),
    value
      ? el('p', { key: 'hint', className: 'meta' }, t('questions.contractHint'))
      : null,
  ]);
};

export const QuestionControls = ({ api, openAutomation }) => {
  const t = useT();
  const [rules, setRules] = React.useState([]);
  const [rule, setRule] = React.useState(blank);
  const [busy, setBusy] = React.useState(false);
  const active = React.useRef(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [profile, setProfile] = React.useState({});
  const [profileId, setProfileId] = React.useState('');
  const [contexts, setContexts] = React.useState([]);
  const [salary, setSalary] = React.useState(undefined);
  const [contract, setContract] = React.useState(false);
  const [learned, setLearned] = React.useState(null);
  const run = async (work) => {
    if (active.current) {
      return;
    }
    active.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (err) {
      setError(err.message);
    } finally {
      active.current = false;
      setBusy(false);
    }
  };
  const reload = async () => setRules(await api.answerRules());
  const save = () =>
    run(async () => {
      const id =
        rule.id ||
        `answer-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
      const saved = await api.saveAnswerRule({
        ...rule,
        id,
        contract,
        ...(contract ? { profile, profileId, salary } : {}),
      });
      setRule(saved.rule);
      await reload();
      setNotice(t('questions.saved'));
    });
  const remove = () =>
    run(async () => {
      await api.deleteAnswerRule(rule.id);
      setRule(blank());
      await reload();
      setNotice(t('questions.deleted'));
    });
  const learn = (apply) =>
    run(async () => {
      const answer = await api.learnAnswers({
        apply,
        contract,
        ...(contract ? { profile, profileId, salary } : {}),
      });
      setLearned(answer);
      if (apply) {
        await reload();
        setNotice(t('questions.learned'));
      }
    });
  return el(
    'details',
    {
      className: 'card col',
      'data-question-controls': true,
      onToggle: (event) => {
        if (isOpening(event) && api.answerRules) {
          run(reload);
        }
      },
    },
    [
      el('summary', { key: 's' }, t('questions.title')),
      el('p', { key: 'intro', className: 'meta' }, t('questions.intro')),
      el(ContractControl, {
        key: 'contract',
        value: contract,
        set: setContract,
        busy,
      }),
      error ? el('p', { key: 'error', role: 'alert' }, error) : null,
      notice ? el('p', { key: 'notice', role: 'status' }, notice) : null,
      busy
        ? el('p', { key: 'busy', role: 'status' }, t('common.loading'))
        : null,
      el(QuestionToolbar, {
        key: 'top',
        busy,
        newRule: () => {
          setRule(blank());
          setNotice('');
        },
        refresh: () => run(reload),
        create: () =>
          openAutomation(
            questionAutomation(t, profile, contexts, salary, profileId)
          ),
      }),
      el(SavedAnswerList, { key: 'rules', rules, rule, busy, setRule }),
      el(
        'fieldset',
        { key: 'editor', disabled: busy },
        el(RuleEditor, { rule, set: setRule, disabled: busy, save, remove })
      ),
      el(LearnedAnswers, { key: 'learn', busy, learned, learn }),
      el(AnswerPolicyControls, { key: 'policy', api, busy, run }),
      el(PreviewControls, {
        key: 'preview',
        busy,
        api,
        run,
        profile,
        setProfile,
        profileId,
        setProfileId,
        contexts,
        setContexts,
        salary,
        setSalary,
      }),
    ]
  );
};

const SavedAnswerList = ({ rules, rule, busy, setRule }) => {
  const t = useT();
  return rules.length
    ? el(
        'ul',
        { key: 'rules', className: 'automation-list' },
        rules.map((entry) =>
          el(
            'li',
            { key: entry.id },
            el(
              'button',
              {
                type: 'button',
                disabled: busy,
                'aria-pressed': entry.id === rule.id,
                onClick: () => setRule(entry),
              },
              entry.question
            )
          )
        )
      )
    : el('p', { key: 'empty', className: 'meta' }, t('questions.empty'));
};
