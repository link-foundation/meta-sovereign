// State behind the Automations screen (issue #31 / PR #34): the list of
// automations (saved and presets) and the editor's form, a preview of
// who would be messaged and why the rest are left out, runs (safe mode
// queues drafts in each chat; auto mode asks first), the run history,
// a people search whose selection can be run on or saved as a list, and
// saved audiences. All data flows through the injected `api`, so the
// screen renders in tests with a fake one.

import { useMemo, useState } from 'react';
import { defaultConfirm, runNotice, useLoaded } from './chat-state.js';
import {
  blankAutomation,
  checkForm,
  localizePreset,
  selectionAudience,
  targetsFor,
  toForm,
} from './automations-model.js';

const failed = (error) => ({
  kind: 'failed',
  error: error?.message ?? String(error),
});

const useEditor = ({ api, tick, refresh, setNotice, confirm, t }) => {
  const [automations] = useLoaded(() => api.automations(), [api, tick], null);
  const [base, setBase] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const list = (automations ?? []).map((a) => localizePreset(t, a));
  const open = (automation) => {
    setBase(automation);
    setForm(toForm(automation));
    setError(null);
    setNotice(null);
  };
  const checked = () => {
    const result = checkForm(form, base ?? {});
    setError(result.error ? result : null);
    return result.automation ?? null;
  };
  const save = async () => {
    const automation = checked();
    if (!automation) {
      return null;
    }
    try {
      await api.saveAutomation(automation);
      setBase({ ...automation, saved: true });
      setNotice({ kind: 'saved', name: automation.name });
      refresh();
      return automation;
    } catch (err) {
      setNotice(failed(err));
      return null;
    }
  };
  const remove = async () => {
    if (!base?.saved || !confirm(t('automations.confirmDelete', form))) {
      return;
    }
    await api.deleteAutomation(base.id);
    setBase(null);
    setForm(null);
    setNotice({ kind: 'deleted', name: form.name });
    refresh();
  };
  return {
    loading: automations === null,
    list,
    current: base,
    form,
    error,
    open,
    create: () => open(blankAutomation(t('automations.newName'))),
    close: () => {
      setBase(null);
      setForm(null);
      setError(null);
    },
    setField: (name, value) => setForm((f) => ({ ...f, [name]: value })),
    checked,
    save,
    remove,
  };
};

const useRuns = ({ api, editor, people, tick, after, confirm, t }) => {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const id = editor.current?.id;
  const [history] = useLoaded(
    () => (id ? api.automationHistory({ automation: id }) : []),
    [api, id, tick],
    []
  );
  const scope = (onSelected, test) =>
    onSelected
      ? { targets: targetsFor(people.selected), test: Boolean(test) }
      : {};
  const preview = async ({ onSelected = false, test = false } = {}) => {
    const automation = editor.checked();
    if (!automation) {
      return null;
    }
    setBusy(true);
    try {
      const next = await api.planAutomation({
        automation,
        ...scope(onSelected, test),
      });
      setPlan({ ...next, onSelected });
      return next;
    } catch (err) {
      after(failed(err));
      return null;
    } finally {
      setBusy(false);
    }
  };
  const run = async ({ onSelected = false, test = false } = {}) => {
    const draft = editor.checked();
    if (!draft) {
      return null;
    }
    const automation = await editor.save();
    if (!automation) {
      return null;
    }
    setBusy(true);
    // Auto mode: the server returns the planned messages first and
    // sends exactly those once the user agrees.
    const result = await api.runAutomation({
      automation: automation.id,
      trigger: 'manual',
      ...scope(onSelected, test),
      ask: (answer) =>
        confirm(
          t('chat.automation.confirmAuto', {
            name: draft.name,
            count: answer.preview?.drafts?.length ?? 0,
          })
        ),
    });
    setBusy(false);
    if (result?.cancelled) {
      return null;
    }
    setPlan(null);
    after(runNotice(result ?? { code: 'no-answer' }));
    return result;
  };
  return {
    plan,
    busy,
    history: history ?? [],
    preview,
    run,
    clearPlan: () => setPlan(null),
  };
};

const usePeople = ({ api, tick, after }) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState([]);
  const [results] = useLoaded(
    () => api.people({ q: query, limit: 50 }),
    [api, query, tick],
    []
  );
  const keys = useMemo(() => new Set(selected.map((p) => p.key)), [selected]);
  const saveList = async (name) => {
    if (!name.trim() || selected.length === 0) {
      return null;
    }
    const answer = await api.saveList({
      name: name.trim(),
      members: selected.map((p) => p.key),
    });
    after({ kind: 'list-saved', name: name.trim(), count: selected.length });
    return answer;
  };
  return {
    query,
    setQuery,
    results: Array.isArray(results) ? results : [],
    selected,
    isSelected: (person) => keys.has(person.key),
    toggle: (person) =>
      setSelected((list) =>
        list.some((p) => p.key === person.key)
          ? list.filter((p) => p.key !== person.key)
          : [...list, person]
      ),
    clear: () => setSelected([]),
    spec: selectionAudience(selected),
    saveList,
  };
};

const useAudiences = ({ api, tick, refresh, after }) => {
  const [saved] = useLoaded(() => api.audiences(), [api, tick], []);
  const [name, setName] = useState('');
  const [spec, setSpec] = useState('');
  const [count, setCount] = useState(null);
  const resolve = async (text = spec) => {
    const answer = await api.resolveAudience({ spec: text, limit: 20 });
    setCount(
      answer?.status === 'failed'
        ? { error: answer.error }
        : { count: answer?.count ?? 0, people: answer?.people ?? [] }
    );
    return answer;
  };
  const save = async () => {
    const answer = await api.saveAudience({ name: name.trim(), spec });
    if (answer?.status === 'failed') {
      after(failed(answer.error));
      return null;
    }
    after({ kind: 'audience-saved', name: name.trim(), count: answer.count });
    setName('');
    setSpec('');
    setCount(null);
    refresh();
    return answer;
  };
  return {
    saved: Array.isArray(saved) ? saved : [],
    name,
    setName,
    spec,
    setSpec: (text) => {
      setSpec(text);
      setCount(null);
    },
    count,
    resolve,
    save,
    remove: async (id) => {
      await api.deleteAudience(id);
      refresh();
    },
  };
};

export const useAutomationsState = (
  api,
  { t, confirm = defaultConfirm } = {}
) => {
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);
  const [notice, setNotice] = useState(null);
  const after = (next) => {
    setNotice(next);
    refresh();
  };
  const ctx = { api, tick, refresh, after, confirm, t, setNotice };
  const editor = useEditor(ctx);
  const people = usePeople(ctx);
  const runs = useRuns({ ...ctx, editor, people });
  const audiences = useAudiences(ctx);
  return {
    editor,
    runs,
    people,
    audiences,
    notice,
    dismiss: () => setNotice(null),
    /** Put a spec (a saved audience, the selection) into the editor. */
    applyAudience: (spec) => {
      if (editor.form) {
        editor.setField('audience', spec);
      }
    },
  };
};
