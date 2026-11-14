import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAssignmentTemplates,
  loadAssignmentTemplates,
  assignmentNamedLanguages,
  assignmentPreferredLanguages,
} from '../src/assignments/templates.js';
import {
  checkAssignmentRestatement,
  assignmentCopiedPhrase,
} from '../src/assignments/privacy.js';
import { createAssignmentPublisher } from '../src/assignments/service.js';
import { assignmentPublicationId } from '../src/assignments/records.js';
import {
  currentFormAssignment,
  rememberFormAssignment,
} from '../src/forms/assignment-store.js';
import {
  saveAnswerModel,
  readAnswerModel,
} from '../src/automation/answer-model-config.js';
import { createAssignmentGithub } from '../src/assignments/github.js';
import {
  assignmentGuide,
  assignmentModelResult,
  assignmentPublisherFixture,
} from '../../experiments/issue-56/assignment-publisher-fixture.mjs';

const draft = async (env) => (await env.publisher.draft(env.input)).draft;
const publish = (env, value) => env.publisher.publish({ draftId: value.id });
const events = (env, name) =>
  env.state.calls.filter((call) => call === name).length;
const held = async (env) =>
  assert.equal(
    (await currentFormAssignment(env.store, env.inspection)).state,
    'needs-repository'
  );

test('lost issue creation followed by an owner edit is never overwritten during recovery', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  const value = await draft(env);
  const write = env.github.writeIssue;
  env.github.writeIssue = async (...args) => {
    await write(...args);
    throw new Error('lost response');
  };
  assert.equal((await publish(env, value)).state, 'uncertain');
  env.state.issues[0].body += '\nOwner clarification.';
  env.state.issues[0].updated_at = '2026-01-02T00:00:00Z';
  const recovered = await publish(env, value);
  assert.equal(recovered.ok, false);
  assert.equal(recovered.code, 'assignment-changed');
  assert.equal(events(env, 'create-issue'), 1);
  assert.equal(events(env, 'update-issue'), 0);
  await held(env);
});

test('a reopened service restores an issued draft without new model or GitHub calls', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  const value = await draft(env);
  const write = env.github.writeIssue;
  env.github.writeIssue = async (...args) => {
    await write(...args);
    throw new Error('lost response');
  };
  assert.equal((await publish(env, value)).state, 'uncertain');
  await assert.rejects(env.publisher.draft(env.input), {
    code: 'assignment-pending',
  });
  const calls = env.state.calls.length;
  const modelCalls = env.state.modelCalls.length;
  const reopened = createAssignmentPublisher(env);
  t.after(reopened.stop);
  const restored = await reopened.restore({
    inspection: env.inspection,
    revision: env.assignment.revision,
  });
  assert.equal(restored.draft.id, value.id);
  assert.equal(restored.attempted, true);
  assert.equal(env.state.calls.length, calls);
  assert.equal(env.state.modelCalls.length, modelCalls);
  assert.equal(
    (await reopened.publish({ draftId: value.id })).state,
    'verified'
  );
  assert.equal(events(env, 'create-issue'), 1);
});

test('malformed saved drafts refuse before external calls', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  const value = await draft(env);
  const saved = await env.store.get(value.id);
  const calls = env.state.calls.length;
  for (const change of [
    { visibility: 'internal' },
    { assignmentRevision: 'stale' },
    { repositoryId: -1 },
    { createdAt: 'invalid' },
  ]) {
    await env.store.put({ ...saved, draft: { ...saved.draft, ...change } });
    await assert.rejects(publish(env, value), { code: 'assignment-draft' });
  }
  assert.equal(env.state.calls.length, calls);
});

test('only the primary recommended table supplies current templates', () => {
  const templates = parseAssignmentTemplates(assignmentGuide);
  assert.equal(templates.python, 'fixture-templates/python-pipeline');
  assert.equal(templates.typescript, templates.javascript);
  assert.equal(Object.keys(templates).length, 3);
  assert.deepEqual(parseAssignmentTemplates('x'.repeat(256 * 1024 + 1)), {});
  assert.deepEqual(
    parseAssignmentTemplates(
      assignmentGuide.replace(
        'https://github.com/fixture-templates/python-pipeline',
        'https://github.com.evil.test/owner/repo'
      )
    ),
    { javascript: templates.javascript, typescript: templates.typescript }
  );
});

test('the live guide is attempted before a disclosed per-language fallback', async () => {
  let calls = 0;
  const catalog = await loadAssignmentTemplates(async () => {
    calls++;
    throw new Error('offline');
  });
  assert.equal(calls, 1);
  assert.equal(catalog.source, 'fallback');
  assert.ok(catalog.repositories.python.startsWith('link-foundation/'));
  const live = await loadAssignmentTemplates(async () => assignmentGuide);
  assert.equal(live.source, 'live');
  assert.ok(!live.fallbackLanguages.includes('python'));
  assert.ok(live.fallbackLanguages.includes('rust'));
});

test('vacancy language detection distinguishes Java, JavaScript and ordinary go', () => {
  assert.deepEqual(
    assignmentPreferredLanguages({
      title: 'Backend engineer',
      skills: ['Go'],
      description: 'Go to our office.',
    }),
    ['go']
  );
  assert.deepEqual(
    assignmentPreferredLanguages({
      title: 'Python engineer',
      skills: ['JavaScript'],
      description: 'JavaScript JavaScript JavaScript',
    }),
    ['python']
  );
  assert.deepEqual(
    assignmentNamedLanguages({
      title: 'Go developer',
      description: 'Go to our office. JavaScript tools.',
      skills: ['Golang'],
    }),
    ['go', 'javascript']
  );
  assert.deepEqual(
    assignmentNamedLanguages({
      title: 'Java engineer',
      description: '',
      skills: [],
    }),
    ['java']
  );
});

test('source-copy checking normalizes case, unicode and punctuation without rejecting five words', () => {
  const original = 'ONE two three, four—five six seven';
  assert.equal(
    assignmentCopiedPhrase(original, 'one TWO three four five SIX'),
    true
  );
  assert.equal(
    assignmentCopiedPhrase(original, 'one two three four five changed'),
    false
  );
});

test('public prose rejects known joined/inflected employer names and non-English script', () => {
  const base = {
    original: 'Тестовое задание: управление запасами.',
    employers: ['Натур Пласт'],
    title: assignmentModelResult.title,
    body: assignmentModelResult.body,
  };
  checkAssignmentRestatement(base);
  assert.throws(
    () =>
      checkAssignmentRestatement({
        ...base,
        employers: ['ВК'],
        body: `${base.body} VK tools.`,
      }),
    { code: 'assignment-employer' }
  );
  checkAssignmentRestatement({ ...base, employers: ['VK'] });
  assert.throws(
    () =>
      checkAssignmentRestatement({
        ...base,
        body: `${base.body} Натурпластом`,
      }),
    { code: 'assignment-employer' }
  );
  assert.throws(
    () =>
      checkAssignmentRestatement({
        ...base,
        title: '任务说明',
        body: '这是一个中文任务说明，需要写出系统设计和验证方法。',
      }),
    { code: 'assignment-english' }
  );
});

test('preview freezes vacancy, template provenance and public content without GitHub writes', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  const value = await draft(env);
  assert.equal(value.template, 'fixture-templates/python-pipeline');
  assert.equal(value.catalogSource, 'live');
  assert.equal(value.templateAction, 'create');
  assert.equal(value.visibility, 'private');
  assert.match(value.body, /## Stack\n/u);
  assert.match(value.body, /most fitting stack/u);
  assert.match(value.body, /Replace the template README/u);
  assert.equal(events(env, 'create'), 0);
  assert.equal(events(env, 'create-issue'), 0);
  assert.equal(env.state.modelCalls.length, 1);
  assert.match(env.state.modelCalls[0].prompt, /Python developer/u);
  assert.match(env.state.modelCalls[0].system, /untrusted data/u);
  await held(env);
});

test('written deliverable uses docs, original language and length instructions', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  const publisher = createAssignmentPublisher({
    ...env,
    modelRunner: async () => ({
      ...assignmentModelResult,
      deliverable: 'document',
      originalLanguage: 'Russian',
      body: `${assignmentModelResult.body} Keep the proposal within three pages.`,
    }),
  });
  t.after(publisher.stop);
  const value = (await publisher.draft(env.input)).draft;
  assert.match(value.body, /## Stack\n/u);
  assert.match(value.body, /## Deliverable and stack\n/u);
  assert.match(value.body, /under `docs\/` in Russian/u);
  assert.match(value.body, /three pages/u);
  assert.match(value.body, /implementation code is not required/u);
});

test('disabled models refuse before reading GitHub or drafting', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  const settings = await readAnswerModel(env.store);
  await saveAnswerModel(env.store, { ...settings, enabled: false });
  await assert.rejects(draft(env), { code: 'assignment-model-unavailable' });
  assert.equal(env.state.calls.length, 0);
  assert.equal(env.state.modelCalls.length, 0);
});

test('invalid or copied model output is never saved as a publishable draft', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  for (const result of [
    { ...assignmentModelResult, language: 'rust' },
    {
      ...assignmentModelResult,
      body: 'The Example Employer requires a design for this new service.',
    },
    { ...assignmentModelResult, body: env.assignment.description },
  ]) {
    const publisher = createAssignmentPublisher({
      ...env,
      modelRunner: async () => result,
    });
    await assert.rejects(publisher.draft(env.input));
    await publisher.stop();
  }
  assert.equal(
    (await env.store.query((row) => row.id.startsWith('assignment-draft:')))
      .length,
    0
  );
});

test('confirmed template repository and exact issue readback release the hold once', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  const value = await draft(env);
  const result = await publish(env, value);
  assert.equal(result.ok, true);
  assert.equal(result.state, 'verified');
  assert.equal(
    result.issue.url,
    'https://github.com/fixture-owner/reviewed-task/issues/1'
  );
  assert.equal(result.assignment.state, 'verified');
  assert.equal(events(env, 'create'), 1);
  assert.equal(events(env, 'seed'), 0);
  assert.equal(events(env, 'create-issue'), 1);
  const count = env.state.calls.length;
  assert.deepEqual(await publish(env, value), result);
  assert.equal(env.state.calls.length, count);
});

test('non-template repositories are seeded before any issue or hold release', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  const read = env.github.repository;
  env.github.repository = async (...args) => {
    const receipt = await read(...args);
    return args[0].startsWith('fixture-templates/')
      ? { ...receipt, is_template: false }
      : receipt;
  };
  const result = await publish(env, await draft(env));
  assert.equal(result.ok, true);
  assert.ok(
    env.state.calls.indexOf('seed') < env.state.calls.indexOf('create-issue')
  );
});

test('lost repository creation response is reconciled without duplicate creation', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  const value = await draft(env);
  const create = env.github.create;
  env.github.create = async (...args) => {
    await create(...args);
    throw new Error('lost response');
  };
  assert.equal((await publish(env, value)).state, 'uncertain');
  await held(env);
  assert.equal((await publish(env, value)).ok, true);
  assert.equal(events(env, 'create'), 1);
});

test('unknown repository creation with no readback is never repeated', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  const value = await draft(env);
  env.github.create = async () => {
    env.state.calls.push('create');
    throw new Error('lost response');
  };
  assert.equal((await publish(env, value)).state, 'uncertain');
  const retry = await publish(env, value);
  assert.equal(retry.code, 'assignment-uncertain');
  assert.equal(events(env, 'create'), 1);
  await held(env);
});

test('lost issue creation response is recovered by its stable marker', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  const value = await draft(env);
  const write = env.github.writeIssue;
  env.github.writeIssue = async (...args) => {
    await write(...args);
    throw new Error('lost response');
  };
  assert.equal((await publish(env, value)).state, 'uncertain');
  assert.equal((await publish(env, value)).ok, true);
  assert.equal(events(env, 'create-issue'), 1);
});

test('unconfirmed issue creation is not retried when the marker is still absent', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  const value = await draft(env);
  env.github.writeIssue = async () => {
    env.state.calls.push('create-issue');
    return {};
  };
  assert.equal((await publish(env, value)).state, 'uncertain');
  assert.equal((await publish(env, value)).code, 'assignment-uncertain');
  assert.equal(events(env, 'create-issue'), 1);
  await held(env);
});

test('a reviewed rerun repairs missing pipelines and updates the existing marked issue', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  assert.equal((await publish(env, await draft(env))).ok, true);
  env.state.pipeline = false;
  env.input.revision = (
    await currentFormAssignment(env.store, env.inspection)
  ).revision;
  const publisher = createAssignmentPublisher({
    ...env,
    modelRunner: async () => ({
      ...assignmentModelResult,
      body: `${assignmentModelResult.body} Include an operational checklist.`,
    }),
  });
  t.after(publisher.stop);
  const value = (await publisher.draft(env.input)).draft;
  assert.equal(value.templateAction, 'merge');
  assert.equal((await publisher.publish({ draftId: value.id })).ok, true);
  assert.equal(events(env, 'create'), 1);
  assert.equal(events(env, 'create-issue'), 1);
  assert.equal(events(env, 'update-issue'), 1);
  assert.equal(events(env, 'seed'), 1);
});

test('assignment and settings revisions are checked again after model completion', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  const publisher = createAssignmentPublisher({
    ...env,
    modelRunner: async () => {
      const changed = globalThis.structuredClone(env.inspection);
      changed.frames[0].intro += ' Add a reporting dashboard.';
      await rememberFormAssignment(env.store, changed);
      return assignmentModelResult;
    },
  });
  t.after(publisher.stop);
  await assert.rejects(publisher.draft(env.input), {
    code: 'assignment-changed',
  });
  assert.equal(events(env, 'create'), 0);
});

test(
  'two service instances cannot publish concurrently and stop drains the model',
  { timeout: 10000 },
  async (t) => {
    const env = await assignmentPublisherFixture();
    t.after(env.publisher.stop);
    let entered;
    const ready = new Promise((resolve) => {
      entered = resolve;
    });
    let closed = false;
    const publisher = createAssignmentPublisher({
      ...env,
      modelRunner: ({ signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              closed = true;
              reject(new Error('stopped'));
            },
            { once: true }
          );
          entered();
        }),
    });
    const pending = publisher.draft(env.input);
    const rejected = assert.rejects(pending);
    await ready;
    await assert.rejects(env.publisher.draft(env.input), {
      code: 'assignment-busy',
    });
    await publisher.stop();
    await rejected;
    assert.equal(closed, true);
    assert.equal(events(env, 'create'), 0);
  }
);

test('the issued ledger is flushed before any external creation', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  const value = await draft(env);
  env.store.flush = async () => {
    throw new Error('disk unavailable');
  };
  assert.equal((await publish(env, value)).state, 'uncertain');
  assert.equal(events(env, 'create'), 0);
  await held(env);
});

test('confirmed publication recovers a failed final local association without GitHub writes', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  const value = await draft(env);
  const put = env.store.put;
  let refuse = true;
  env.store.put = async (row) => {
    if (row.id === env.assignment.id && refuse) {
      refuse = false;
      throw new Error('disk unavailable');
    }
    return put(row);
  };
  assert.equal((await publish(env, value)).state, 'uncertain');
  const count = env.state.calls.length;
  const result = await publish(env, value);
  assert.equal(result.ok, true);
  assert.equal(env.state.calls.length, count);
  assert.equal(
    (await currentFormAssignment(env.store, env.inspection)).state,
    'verified'
  );
  assert.equal(
    (
      await env.store.get(
        await assignmentPublicationId(value.assignmentId, value.target)
      )
    ).stage,
    'verified'
  );
});

test('GitHub adapter distinguishes a positive 404 from authentication/transport failure', async () => {
  const missing = createAssignmentGithub({
    run: async () => {
      throw Object.assign(new Error('private detail'), {
        commandOutput: 'HTTP/2.0 404 Not Found\r\n\r\n{}',
      });
    },
  });
  assert.equal(await missing.repository('owner/repo'), null);
  const denied = createAssignmentGithub({
    run: async () => {
      throw new Error('private authentication detail');
    },
  });
  await assert.rejects(
    denied.repository('owner/repo'),
    (error) =>
      error.code === 'assignment-github-unverified' &&
      !error.message.includes('private authentication')
  );
});

test('GitHub API issue bodies use bounded stdin and explicit template creation flags', async () => {
  const calls = [];
  const github = createAssignmentGithub({
    run: async (command, args, options) => {
      calls.push({ command, args, options });
      return { stdout: 'HTTP/2.0 200 OK\r\n\r\n{}' };
    },
  });
  const value = {
    target: 'owner/repo',
    template: 'templates/pipeline',
    visibility: 'private',
    title: 'Reviewed title',
  };
  await github.create(value, { templateRepository: { is_template: true } });
  assert.deepEqual(calls[0].args, [
    'repo',
    'create',
    'owner/repo',
    '--private',
    '--template',
    'templates/pipeline',
  ]);
  await github.writeIssue(value, { body: 'Reviewed body' });
  assert.ok(calls[1].args.includes('--input'));
  assert.equal(JSON.parse(calls[1].options.input).body, 'Reviewed body');
  assert.ok(!calls[1].args.some((part) => part.includes('Reviewed body')));
});

test('a different saved draft cannot take over an issued publication', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  const first = await draft(env);
  const second = await draft(env);
  const create = env.github.create;
  env.github.create = async (...args) => {
    await create(...args);
    throw new Error('lost creation response');
  };
  assert.equal((await publish(env, first)).state, 'uncertain');
  const calls = env.state.calls.length;
  await assert.rejects(publish(env, second), { code: 'assignment-pending' });
  assert.equal(env.state.calls.length, calls);
  assert.equal((await publish(env, first)).state, 'verified');
  assert.equal(events(env, 'create'), 1);
});

test('publication recovery refuses a repository recreated under the same name', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  const value = await draft(env);
  const write = env.github.writeIssue;
  env.github.writeIssue = async (...args) => {
    await write(...args);
    throw new Error('lost issue response');
  };
  assert.equal((await publish(env, value)).state, 'uncertain');
  env.state.repository.id++;
  const recovered = await publish(env, value);
  assert.equal(recovered.ok, false);
  assert.equal(recovered.code, 'assignment-changed');
  assert.equal(events(env, 'create-issue'), 1);
  assert.equal(events(env, 'update-issue'), 0);
  await held(env);
});
