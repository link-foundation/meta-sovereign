import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  learnSavedAnswers,
  saveAnswerRule,
  deleteAnswerRule,
  listAnswerRules,
} from '../src/automation/question-store.js';
import {
  saveAnswerPolicy,
  QA_POLICY_ID,
} from '../src/automation/question-policy.js';

const seed = async () => {
  const store = createMemoryStore();
  for (const [id, sender, body] of [
    [1, 'them', 'Where do you live?'],
    [2, 'me', 'Vietnam.'],
  ]) {
    await store.put({
      id: `msg:hh:1:${id}`,
      source: 'hh',
      chat: '1',
      sender,
      body,
      timestamp: `2026-11-09T10:00:0${id}Z`,
    });
  }
  return store;
};

const duringRead = (store, edit) => {
  const get = store.get;
  let changed = false;
  store.get = async (id, project) => {
    if (!changed && id.startsWith('msg:')) {
      changed = true;
      await edit();
    }
    return get(id, project);
  };
};

test(
  'a policy edit during learning prevents stale proposals from applying',
  { timeout: 5000 },
  async () => {
    const store = await seed();
    duringRead(store, () => saveAnswerPolicy(store, { rejected: ['Vietnam'] }));
    await assert.rejects(
      learnSavedAnswers(store, { apply: true }),
      /knowledge changed/iu
    );
    assert.deepEqual(await listAnswerRules(store), []);
    assert.deepEqual((await store.get(QA_POLICY_ID)).rejected, ['Vietnam']);
  }
);

test(
  'learning cannot resurrect a rule deleted during its scan',
  { timeout: 5000 },
  async () => {
    const store = await seed();
    const {
      rules: [rule],
    } = await learnSavedAnswers(store, { apply: true });
    duringRead(store, () => deleteAnswerRule(store, rule.id));
    await assert.rejects(
      learnSavedAnswers(store, { apply: true }),
      /knowledge changed/iu
    );
    assert.equal(await store.get(rule.id), null);
  }
);

test(
  'a canonical correction during a preview invalidates stale knowledge',
  { timeout: 5000 },
  async () => {
    const store = await seed();
    duringRead(store, () =>
      saveAnswerRule(store, {
        id: 'owner-city',
        question: 'Where do you live?',
        answers: [{ text: 'Thailand.', approved: true, canonical: true }],
      })
    );
    await assert.rejects(learnSavedAnswers(store), /knowledge changed/iu);
    const [rule] = await listAnswerRules(store);
    assert.equal(rule.id, 'qa-rule:owner-city');
    assert.equal(rule.answers[0].text, 'Thailand.');
  }
);

test(
  'query-only stores recheck knowledge even without subscription events',
  { timeout: 5000 },
  async () => {
    const store = await seed();
    delete store.subscribe;
    delete store.scan;
    await saveAnswerPolicy(store, { rejected: ['Elsewhere'] });
    duringRead(store, () => store.delete(QA_POLICY_ID));
    await assert.rejects(
      learnSavedAnswers(store, { apply: true }),
      /knowledge changed/iu
    );
    assert.deepEqual(await listAnswerRules(store), []);
  }
);

test(
  'canonical saves validate against an earlier in-flight policy write',
  { timeout: 5000 },
  async () => {
    const store = await seed();
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    const put = store.put;
    store.put = async (link) => {
      if (link.id === QA_POLICY_ID) {
        entered.resolve();
        await release.promise;
      }
      return put(link);
    };
    const policy = saveAnswerPolicy(store, { rejected: ['Vietnam'] });
    await entered.promise;
    const saved = saveAnswerRule(store, {
      id: 'city',
      question: 'Where do you live?',
      answers: [{ text: 'Vietnam.', approved: true, canonical: true }],
    });
    const result = saved.then(
      (value) => ({ value }),
      (error) => ({ error })
    );
    try {
      await setImmediate();
    } finally {
      release.resolve();
    }
    await policy;
    assert.match((await result).error?.message ?? '', /rejected content/iu);
    assert.equal(await store.get('qa-rule:city'), null);
  }
);

for (const operation of ['save', 'delete']) {
  test(
    `a concurrent owner ${operation} survives an in-flight learned write`,
    { timeout: 5000 },
    async () => {
      const store = await seed();
      const {
        rules: [rule],
      } = await learnSavedAnswers(store, { apply: true });
      const entered = Promise.withResolvers();
      const release = Promise.withResolvers();
      const put = store.put;
      let held = false;
      store.put = async (link) => {
        if (!held && link.id === rule.id) {
          held = true;
          entered.resolve();
          await release.promise;
        }
        return put(link);
      };
      const learning = learnSavedAnswers(store, { apply: true });
      await entered.promise;
      const edit =
        operation === 'delete'
          ? deleteAnswerRule(store, rule.id)
          : saveAnswerRule(store, {
              ...rule,
              answers: [{ text: 'Thailand.', approved: true, canonical: true }],
            });
      try {
        await setImmediate();
      } finally {
        release.resolve();
      }
      await Promise.all([learning, edit]);
      const saved = await store.get(rule.id);
      if (operation === 'delete') {
        assert.equal(saved, null);
      } else {
        assert.equal(saved.answers[0].text, 'Thailand.');
        assert.equal(saved.answers[0].canonical, true);
      }
    }
  );
}

test(
  'a failed owner write releases the queue and learning subscriptions',
  { timeout: 5000 },
  async () => {
    const store = await seed();
    const put = store.put;
    let fail = true;
    store.put = async (link) => {
      if (fail && link.id === QA_POLICY_ID) {
        fail = false;
        throw new Error('disk full');
      }
      return put(link);
    };
    await assert.rejects(saveAnswerPolicy(store, {}), /disk full/iu);
    await saveAnswerPolicy(store, { rejected: ['Elsewhere'] });
    const subscribe = store.subscribe;
    let active = 0;
    store.subscribe = (listener) => {
      active++;
      const stop = subscribe(listener);
      return () => {
        active--;
        stop();
      };
    };
    duringRead(store, () => saveAnswerPolicy(store, { rejected: ['Vietnam'] }));
    await assert.rejects(learnSavedAnswers(store), /knowledge changed/iu);
    assert.equal(active, 0);
    assert.deepEqual((await learnSavedAnswers(store)).rules, []);
    assert.equal(active, 0);
  }
);

test(
  'knowledge snapshots refuse an over-capacity archive before applying',
  { timeout: 5000 },
  async () => {
    const store = await seed();
    // Finite fixture: roughly 8.6 MiB of serialized rules, using shared strings.
    const text = 'x'.repeat(12000);
    for (let id = 0; id < 60; id++) {
      await store.put({
        id: `qa-rule:capacity-${id}`,
        question: `What is answer ${id}?`,
        answers: Array.from({ length: 6 }, () => ({ text, count: 0 })),
      });
    }
    await assert.rejects(
      learnSavedAnswers(store, { apply: true }),
      /knowledge capacity exceeded/iu
    );
    assert.equal((await listAnswerRules(store)).length, 60);
  }
);
