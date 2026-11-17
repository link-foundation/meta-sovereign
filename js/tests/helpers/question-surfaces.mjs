import assert from 'node:assert/strict';
import { createAutomationCommands } from '../../src/cli/automation-commands.js';
import { questionApi } from '../../src/web/question-api.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
} from '../../src/transport/lino.js';
import { startQuestionFixtureServer } from './question-fixture-server.mjs';
import { postQuestion } from './question-http.mjs';

/** Check one saved configuration through CLI, offline UI and negotiated HTTP. */
export const assertQuestionPreviewSurfaces = async ({
  store,
  automationId,
  input,
  verify,
}) => {
  const cli = createAutomationCommands({ openStore: async () => store });
  const output = [];
  const args = {
    _: ['answers', 'plan'],
    automation: automationId,
    question: input.question,
    json: true,
  };
  if (input.options) {
    args.options = encodeWire(input.options);
  }
  assert.equal(await cli.automations(args, (line) => output.push(line)), 0);
  verify(JSON.parse(output.at(-1)));
  const offline = questionApi({
    store,
    remote: { get: async () => null, report: async () => null },
  });
  verify(await offline.previewAnswer(input));
  const server = await startQuestionFixtureServer({ store });
  try {
    for (const media of [LINO_TEXT, LINO_BINARY]) {
      const response = await postQuestion(
        `http://127.0.0.1:${server.port}`,
        'plan',
        input,
        media
      );
      assert.equal(response.status, 200);
      assert.equal(response.contentType, media);
      verify(response.body);
    }
  } finally {
    await server.close();
  }
};
