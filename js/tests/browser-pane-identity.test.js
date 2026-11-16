import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {
  browserPaneIdentity,
  browserPaneHeader,
} from '../src/sources/browser-pane-identity.js';

const fixture = () => {
  const fields = { company: 'Employer', vacancy: 'Engineer' };
  const context = vm.createContext({
    window: {},
    document: {
      querySelectorAll: (name) =>
        fields[name] === undefined
          ? []
          : [
              {
                textContent: fields[name],
                getAttribute: () => '',
              },
            ],
    },
    spec: { paneIdentity: { fields: ['company', 'vacancy'] } },
  });
  const read = (chat, messages) => {
    context.chat = chat;
    context.messages = messages.map((id) => ({ id }));
    return vm.runInContext(
      `(() => { const browserPaneHeader = (${browserPaneHeader.toString()}); return (${browserPaneIdentity.toString()})(spec, chat, messages); })()`,
      context
    );
  };
  return { read, fields, context };
};

test('an SPA URL change cannot relabel previously observed native message IDs', () => {
  const { read } = fixture();
  assert.equal(read('7', ['101', '102']), null);
  assert.equal(read('8', ['101', '102']).code, 'answer-chat-unverified');
  assert.equal(read('8', ['103', '104']), null);
  assert.equal(read('7', ['101', '102', '105']), null);
});

test('same-chat header replacement and temporarily missing metadata refuse before action', () => {
  const { read, fields } = fixture();
  assert.equal(read('7', ['101']), null);
  fields.company = 'Another employer';
  assert.equal(read('7', ['101']).code, 'answer-chat-unverified');
  fields.company = 'Employer';
  delete fields.vacancy;
  assert.equal(read('7', ['101']).code, 'answer-chat-unverified');
  fields.vacancy = 'Engineer';
  assert.equal(read('7', ['101']), null);
});

test('empty mounts and partial metadata hydration do not freeze an invented header', () => {
  const { read, fields } = fixture();
  delete fields.vacancy;
  assert.equal(read('7', ['101']), null);
  fields.company = 'Hydrated employer';
  fields.vacancy = 'Hydrated vacancy';
  assert.equal(read('7', []), null);
  assert.equal(read('7', ['101']), null);
  fields.vacancy = 'Unexpected vacancy';
  assert.equal(read('7', ['101']).code, 'answer-chat-unverified');
});
