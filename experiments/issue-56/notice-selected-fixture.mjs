import {
  activeReview,
  noticeText,
  recognizedNoticeRule,
} from './notice-fixture.mjs';
import { saveAnswerRule } from '../../js/src/automation/question-store.js';
import { saveAnswerPolicy } from '../../js/src/automation/question-policy.js';

export const prepareSelectedUnreadNotice = async (fixture) => {
  await saveAnswerRule(fixture.store, recognizedNoticeRule());
  await saveAnswerPolicy(fixture.store, {
    notices: { acknowledgements: 'reply-recognized' },
  });
  await fixture.reset({
    emptyOriginal: true,
    unreadInitially: true,
    unreadChats: ['8'],
    latestMessages: {
      7: activeReview.replaceAll('\n', '<br>'),
      8: noticeText,
    },
  });
};
