import { questionBrowserFixture } from './question-browser-fixture.mjs';
import { textReplyExpected, textReplyBody } from './text-reply-fixture.mjs';

export const questionTextFixture = async (options = {}) => {
  const env = await questionBrowserFixture(options);
  env.state.snapshot = { ...textReplyExpected(), hasDraft: false };
  env.state.textReplies = [];
  env.send.textReplySources = () => [{ id: 'hh', name: 'HeadHunter' }];
  env.send.replyText = async (input) => {
    env.state.textReplies.push(input);
    return options.replyText
      ? options.replyText(input)
      : {
          via: 'browser',
          source: input.source,
          chat: input.chat,
          text: input.text,
          messageId: '102',
        };
  };
  return env;
};

export const textInput = (review, text = textReplyBody) => ({
  id: review.id,
  text,
  confirm: true,
});
