import { createAutomationCommands } from '../../js/src/cli/automation-commands.js';
import { startQuestionFixtureServer } from '../../js/tests/helpers/question-fixture-server.mjs';
import { LINO_TEXT, readWireResponse } from '../../js/src/transport/lino.js';
import { postQuestion } from '../../js/tests/helpers/question-http.mjs';
import assert from 'node:assert/strict';
import { checkUnreadReview } from '../../js/src/automation/question-unread-state.js';
import { waitUnreadReview } from './question-unread-review-fixture.mjs';

/** Native choice and text tests use the same real CLI command dispatch. */
export const questionBrowserCli = (env) => {
  const cli = createAutomationCommands({
    openStore: async () => env.store,
    send: env.send,
    modelRunner: env.runner,
    forms: env.forms,
  });
  const output = [];
  return async (action, extra = {}) => {
    const code = await cli.automations(
      {
        _: ['answers', 'browser', action],
        json: true,
        now: env.state.now.toISOString(),
        ...extra,
      },
      (line) => output.push(line)
    );
    return {
      code,
      value: code === 0 ? JSON.parse(output.at(-1)) : output.at(-1),
    };
  };
};

/** Shared private question server; negotiated requests never touch the user's app. */
export const questionBrowserHttp = async (env) => {
  const server = await startQuestionFixtureServer(env);
  const base = `http://127.0.0.1:${server.port}`;
  const call = async (action, input, media = LINO_TEXT, headers = {}) => {
    if (input) {
      return postQuestion(base, `browser/${action}`, input, media, headers);
    }
    const response = await fetch(`${base}/api/automations/answers/browser`, {
      headers: { accept: media },
    });
    return { status: response.status, body: await readWireResponse(response) };
  };
  return { server, call };
};

/** Use a fresh owned pass to check the foreground CLI or one Lino encoding. */
export const unreadAnswerClientReceipt = async (env, media, cliFlags = {}) => {
  if (!media) {
    const result = await questionBrowserCli(env)('unread', {
      source: 'hh',
      confirm: true,
      'pass-id': env.input.id,
      'answer-chats': true,
      ...cliFlags,
    });
    assert.equal(result.code, 0, JSON.stringify(result.value));
    return result.value;
  }
  const { call, server } = await questionBrowserHttp(env);
  try {
    assert.equal((await call('unread-start', env.input, media)).status, 200);
    await waitUnreadReview(env.browser, env.input.id);
    const { body, status } = await call(
      'unread-status',
      { id: env.input.id },
      media
    );
    assert.equal(status, 200);
    return checkUnreadReview(body, env.input.id);
  } finally {
    await server.close();
  }
};
