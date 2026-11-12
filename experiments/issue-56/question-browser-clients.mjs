import { createAutomationCommands } from '../../js/src/cli/automation-commands.js';
import { startQuestionFixtureServer } from '../../js/tests/helpers/question-fixture-server.mjs';
import { LINO_TEXT, readWireResponse } from '../../js/src/transport/lino.js';
import { postQuestion } from '../../js/tests/helpers/question-http.mjs';

/** Native choice and text tests use the same real CLI command dispatch. */
export const questionBrowserCli = (env) => {
  const cli = createAutomationCommands({
    openStore: async () => env.store,
    send: env.send,
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
