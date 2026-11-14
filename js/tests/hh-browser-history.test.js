import test from 'node:test';
import assert from 'node:assert/strict';
import { withHistory } from '../../experiments/issue-56/browser-history-fixture.mjs';

test('HH application titles become chronology barriers even without text or delivery icons', () => {
  const titles = [
    'Отклик на вакансию',
    ' Vacancy   application ',
    'Application for the vacancy',
    'Response to a vacancy',
    'Bewerbung',
  ];
  withHistory(
    titles.map((title) => ({ title })),
    (read) => {
      const history = read('history');
      assert.equal(history.chat, '7');
      assert.equal(history.messages.length, titles.length);
      assert.ok(history.messages.every((row) => row.service === true));
      assert.equal(read('read').code, 'answer-question-unavailable');
    }
  );
});

test('employer and recruiter-bot questions mentioning applications stay actionable', () => {
  withHistory(
    [
      { title: 'Recruiter bot', body: 'When did you submit your application?' },
      {
        title: 'Recruiter',
        body: 'Vacancy application: can you start Monday?',
      },
    ],
    (read) => {
      const value = read('read');
      assert.equal(value.question.id, '2');
      assert.equal(value.question.outgoing, false);
      assert.ok(value.messages.every((row) => !row.service));
    }
  );
});

test('hidden application duplicates never become history barriers', () => {
  withHistory(
    [
      { title: 'Vacancy application', hidden: true },
      { title: 'Vacancy application', detached: true },
      { body: 'Can you start Monday?' },
    ],
    (read) => {
      assert.deepEqual(
        read('history').messages.map((row) => row.id),
        ['3']
      );
    }
  );
});

test('a blank verified HH chat remains readable without inventing a question', () => {
  withHistory([], (read) => {
    assert.deepEqual(read('history'), { chat: '7', messages: [] });
    assert.equal(read('read').code, 'answer-question-unavailable');
  });
});
