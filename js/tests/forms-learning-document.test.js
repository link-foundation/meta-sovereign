import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { observeFormLearning } from '../src/forms/monitor-learning-document.js';

const fixture = () => {
  const events = new Map();
  const field = { closest: () => field };
  const document = {
    body: { innerText: '' },
    location: { href: 'https://example.test/form' },
    querySelectorAll: () => [field],
    addEventListener: (name, callback) => events.set(name, callback),
  };
  let at = 1000;
  const observer = runInNewContext(`(${observeFormLearning.toString()})()`, {
    document,
    Date: { now: () => ++at },
  });
  const button = (text) => ({ getAttribute: () => null, textContent: text });
  return {
    document,
    read: () =>
      JSON.parse(JSON.stringify(observer.read({ fields: [{ index: 0 }] }))),
    edit: (isTrusted) => events.get('input')({ isTrusted, target: field }),
    enter: () =>
      events.get('keydown')({ isTrusted: true, key: 'Enter', target: field }),
    click: (name, isTrusted = true) =>
      events.get('click')({
        isTrusted,
        target: {
          closest: (selector) =>
            selector.startsWith('button') ? button(name) : null,
        },
      }),
    submit: (name, isTrusted = true) =>
      events.get('submit')({ isTrusted, submitter: button(name) }),
  };
};

test('only trusted owner edits mark the actual control; observers do not read its value or prevent events', () => {
  const env = fixture();
  env.edit(false);
  assert.equal(env.read().edits, 0);
  env.edit(true);
  const observed = env.read();
  assert.equal(observed.edits, 1);
  assert.deepEqual(observed.changes, [{ index: 0, at: observed.editedAt }]);
});

test('Next in supported languages and synthetic Send do not establish submission intent; trusted native Enter does', () => {
  const env = fixture();
  for (const name of [
    'Next',
    'Tiếp theo →',
    'Далее',
    '下一页',
    'अगला',
    'Suivant',
    'Weiter',
  ]) {
    env.click(name);
    env.submit(name);
  }
  env.click('Send', false);
  env.submit('Submit', false);
  assert.equal(env.read().intent, 0);
  env.submit('');
  assert.equal(
    env.read().intent,
    0,
    'requestSubmit without an owner gesture is not an owner send'
  );
  env.enter();
  env.submit('');
  assert.equal(env.read().intent, 1);
});

test('Vietnamese and other Send controls require later confirmation; a confirmation already present is insufficient', () => {
  for (const name of [
    'Send',
    'Submit',
    'Gửi',
    'Отправить',
    '提交',
    'भेजें',
    'Envoyer',
    'Senden',
  ]) {
    const env = fixture();
    env.click(name);
    assert.equal(env.read().intent, 1);
    assert.equal(env.read().confirmation, false);
    env.document.body.innerText = 'Câu trả lời của bạn đã được ghi lại';
    assert.equal(env.read().confirmation, true);
    env.click(name);
    assert.equal(env.read().confirmation, false);
  }
});

test('Google Forms response URL evidence is language-independent and restricted to the provider host/path', () => {
  const env = fixture();
  for (const url of [
    'https://example.test/forms/d/e/x/formResponse',
    'https://docs.google.com.evil.test/forms/d/e/x/formResponse',
    'https://docs.google.com/forms/d/e/x/viewform',
  ]) {
    env.document.location.href = url;
    assert.equal(env.read().responseUrl, false);
  }
  env.document.location.href =
    'https://docs.google.com/forms/d/e/x/formResponse?hl=vi';
  assert.equal(env.read().responseUrl, true);
});
