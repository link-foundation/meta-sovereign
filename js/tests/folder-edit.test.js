// Creating and editing chat folders (R-Y164): the DialogFilter made for
// Telegram (layer 225: a TextWithEntities title, InputPeers), the next free
// id, delete, order, the recommended folders, Telegram's limit errors as
// codes, the routes' strict validation, and the page's pure helpers. Fake
// clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createFolderEdit,
  validFolder,
  validId,
} from '../src/sources/telegram-folder-edit.js';
import { postRoute } from './helpers/post-route.js';
import {
  KINDS_IN,
  draftOf,
  draftProblem,
  errorKey,
  freshSuggestions,
  movedOrder,
  requestOf,
  withPick,
} from '../src/web/chat-folder-model.js';

const named = (className) =>
  class {
    constructor(fields = {}) {
      Object.assign(this, fields);
      this.className = className;
    }
  };

const Api = {
  DialogFilter: named('DialogFilter'),
  TextWithEntities: named('TextWithEntities'),
  messages: {
    GetDialogFilters: named('GetDialogFilters'),
    UpdateDialogFilter: named('UpdateDialogFilter'),
    UpdateDialogFiltersOrder: named('UpdateDialogFiltersOrder'),
    GetSuggestedDialogFilters: named('GetSuggestedDialogFilters'),
  },
};

const make = ({ filters = [], suggested = [], fail = null } = {}) => {
  const log = [];
  const client = {
    invoke: async (request) => {
      log.push(request);
      if (fail && request.className !== 'GetDialogFilters') {
        throw Object.assign(new Error(fail), { errorMessage: fail });
      }
      if (request.className === 'GetDialogFilters') {
        return { filters };
      }
      if (request.className === 'GetSuggestedDialogFilters') {
        return suggested;
      }
      return true;
    },
  };
  const actions = createFolderEdit(
    {
      importer: async () => ({
        Api,
        helpers: { returnBigInt: (v) => BigInt(v) },
      }),
      connection: {
        withPeer: async (_c, chat, use) => use({ resolved: chat }),
      },
    },
    { userClient: async () => client }
  );
  return { actions, log };
};

const work = {
  title: ' Work ',
  emoticon: '💼',
  groups: true,
  excludeMuted: true,
  include: ['42', '-1005'],
  exclude: ['-77'],
  pinned: ['42', '-77'],
};

test('a new folder is a DialogFilter with the next free id (R-Y164)', async () => {
  const { actions, log } = make({
    filters: [{ className: 'DialogFilterDefault' }, { id: 2 }, { id: 5 }],
  });
  const answer = await actions.folderSave({ folder: work });
  assert.deepEqual(answer, { ok: true, id: 6 });
  const sent = log.at(-1);
  assert.equal(sent.className, 'UpdateDialogFilter');
  assert.equal(sent.id, 6);
  const filter = sent.filter;
  assert.equal(filter.className, 'DialogFilter');
  assert.equal(filter.id, 6);
  assert.equal(filter.title.className, 'TextWithEntities');
  assert.equal(filter.title.text, 'Work');
  assert.deepEqual(filter.title.entities, []);
  assert.equal(filter.emoticon, '💼');
  assert.equal(filter.groups, true);
  assert.equal(filter.excludeMuted, true);
  assert.equal(filter.contacts, undefined);
  assert.deepEqual(filter.includePeers, [
    { resolved: '42' },
    { resolved: '-1005' },
  ]);
  assert.deepEqual(filter.excludePeers, [{ resolved: '-77' }]);
  assert.deepEqual(
    filter.pinnedPeers,
    [{ resolved: '42' }],
    'an excluded chat is never pinned'
  );
});

test('an old folder keeps its id; the first new one is 2 (R-Y164)', async () => {
  const edit = make();
  await edit.actions.folderSave({ id: 9, folder: work });
  assert.equal(edit.log.length, 1, 'no id to look for');
  assert.equal(edit.log[0].id, 9);
  const first = make({ filters: [{ className: 'DialogFilterDefault' }] });
  assert.deepEqual(await first.actions.folderSave({ folder: work }), {
    ok: true,
    id: 2,
  });
});

test('delete, order and recommended folders (R-Y164)', async () => {
  const { actions, log } = make({
    suggested: [
      {
        className: 'DialogFilterSuggested',
        description: 'Unread chats',
        filter: {
          className: 'DialogFilter',
          id: 3,
          title: { text: 'Unread' },
          excludeRead: true,
          groups: true,
          includePeers: [{ className: 'InputPeerUser', userId: 1 }],
          excludePeers: [],
          pinnedPeers: [],
        },
      },
    ],
  });
  assert.deepEqual(await actions.folderDelete({ id: 4 }), { ok: true });
  assert.equal(log[0].className, 'UpdateDialogFilter');
  assert.equal(log[0].id, 4);
  assert.equal(log[0].filter, undefined, 'no filter deletes');
  assert.deepEqual(await actions.foldersReorder({ order: [0, 5, 2] }), {
    ok: true,
  });
  assert.deepEqual(log[1].order, [0, 5, 2]);
  const got = await actions.foldersSuggested();
  assert.equal(got.ok, true);
  assert.equal(got.suggested[0].description, 'Unread chats');
  assert.equal(got.suggested[0].folder.title, 'Unread');
  assert.equal(got.suggested[0].folder.excludeRead, true);
  assert.deepEqual(got.suggested[0].folder.include, [], 'rules only');
});

test("Telegram's limits come back as codes (R-Y164)", async () => {
  const cases = [
    ['FILTER_INCLUDE_TOO_MUCH', 'include-too-much'],
    ['DIALOG_FILTERS_TOO_MUCH', 'too-many-folders'],
    ['FILTER_INCLUDE_EMPTY', 'include-empty'],
    ['FILTER_TITLE_EMPTY', 'title-empty'],
    ['FLOOD_WAIT_9', 'flood'],
    ['SOMETHING_ELSE', 'failed'],
  ];
  for (const [error, code] of cases) {
    const { actions } = make({ fail: error });
    const answer = await actions.folderSave({ id: 3, folder: work });
    assert.equal(answer.ok, false);
    assert.equal(answer.code, code, error);
  }
});

test('bad requests never reach Telegram (R-Y164)', async () => {
  const { actions, log } = make();
  const bad = { ok: false, error: 'bad request', code: 'failed' };
  assert.deepEqual(await actions.folderSave({}), bad);
  assert.deepEqual(
    await actions.folderSave({ folder: { ...work, title: 'x'.repeat(13) } }),
    bad
  );
  assert.deepEqual(await actions.folderSave({ id: 1, folder: work }), bad);
  assert.deepEqual(await actions.folderDelete({ id: 0 }), bad);
  assert.deepEqual(await actions.foldersReorder({ order: [2, 2] }), bad);
  assert.deepEqual(await actions.foldersReorder({ order: [] }), bad);
  assert.equal(log.length, 0);
});

test('folder and id validation is strict (R-Y164)', () => {
  assert.equal(validFolder(work), true);
  assert.equal(validFolder({ title: '好'.repeat(12) }), true, 'letters');
  assert.equal(validFolder({ title: '好'.repeat(13) }), false);
  assert.equal(validFolder({ title: '  ' }), false);
  assert.equal(validFolder({ title: 'a', groups: 'yes' }), false);
  assert.equal(validFolder({ title: 'a', include: ['x1'] }), false);
  assert.equal(validFolder({ title: 'a', include: ['1', '1'] }), false);
  assert.equal(validFolder({ title: 'a', include: 'all' }), false);
  assert.equal(validFolder([]), false);
  assert.equal(validFolder(null), false);
  assert.equal(validId(2), true);
  assert.equal(validId(1), false);
  assert.equal(validId('2'), false);
  assert.equal(validId(2.5), false);
});

test('the routes validate before asking the account (R-Y164)', async () => {
  const asked = [];
  const account = {
    folderSave: async (a) => asked.push(['save', a]) && { ok: true, id: 2 },
    folderDelete: async (a) => asked.push(['delete', a]) && { ok: true },
    foldersReorder: async (a) => asked.push(['order', a]) && { ok: true },
    foldersSuggested: async () => asked.push(['suggested']) && { ok: true },
  };
  assert.equal(await postRoute('folder-save', { folder: work }, account), 200);
  assert.equal(await postRoute('folder-save', {}, account), 400);
  assert.equal(
    await postRoute('folder-save', { id: 'x', folder: work }, account),
    400
  );
  assert.equal(await postRoute('folder-delete', { id: 3 }, account), 200);
  assert.equal(await postRoute('folder-delete', { id: 0 }, account), 400);
  assert.equal(
    await postRoute('folders-reorder', { order: [0, 3] }, account),
    200
  );
  assert.equal(
    await postRoute('folders-reorder', { order: [1] }, account),
    400
  );
  assert.equal(await postRoute('folders-suggested', {}, account), 200);
  assert.equal(await postRoute('folder-save', { folder: work }, {}), 400);
  assert.deepEqual(
    asked.map((a) => a[0]),
    ['save', 'delete', 'order', 'suggested']
  );
});

test('a draft: checks, request, picks (R-Y164)', () => {
  const blank = draftOf();
  assert.equal(blank.id, null);
  assert.equal(draftProblem(blank), 'title-empty');
  assert.equal(draftProblem({ ...blank, title: 'x'.repeat(13) }), 'title-long');
  assert.equal(draftProblem({ ...blank, title: 'Ok' }), 'include-empty');
  assert.equal(draftProblem({ ...blank, title: 'Ok', bots: true }), null);
  assert.equal(draftProblem({ ...blank, title: 'Ok', include: ['5'] }), null);
  assert.ok(KINDS_IN.includes('nonContacts'));

  const body = requestOf({
    ...draftOf({ id: 4, title: 'Mine', groups: true, pinned: ['9'] }),
    title: ' Mine ',
    exclude: ['9'],
  });
  assert.equal(body.id, 4);
  assert.equal(body.folder.title, 'Mine');
  assert.equal(body.folder.groups, true);
  assert.deepEqual(body.folder.pinned, [], 'excluded, so not pinned');
  assert.equal('id' in requestOf(blank), false, 'a new folder has no id');
  assert.equal(validFolder(requestOf({ ...blank, title: 'A' }).folder), true);

  let draft = withPick(blank, 'include', '5');
  draft = withPick(draft, 'exclude', '5');
  assert.deepEqual([draft.include, draft.exclude], [[], ['5']]);
  draft = withPick(draft, 'exclude', '5');
  assert.deepEqual(draft.exclude, []);
});

test('moving a folder keeps "All chats" in its place (R-Y164)', () => {
  const folders = [{ id: 4 }, { id: 0, all: true }, { id: 2 }, { id: 7 }];
  assert.deepEqual(movedOrder(folders, 2, -1), [2, 0, 4, 7]);
  assert.deepEqual(movedOrder(folders, 4, 1), [2, 0, 4, 7]);
  assert.deepEqual(movedOrder(folders, 7, -1), [4, 0, 7, 2]);
  assert.equal(movedOrder(folders, 4, -1), null);
  assert.equal(movedOrder(folders, 7, 1), null);
  assert.equal(movedOrder(folders, 99, 1), null);
});

test('recommended folders already added are left out; words for codes (R-Y164)', () => {
  const suggested = [
    { folder: { title: 'Unread' } },
    { folder: { title: 'Personal' } },
  ];
  assert.deepEqual(
    freshSuggestions(suggested, [{ title: 'unread' }]).map(
      (s) => s.folder.title
    ),
    ['Personal']
  );
  const t = (key) => (key.endsWith('.known') ? 'words' : key);
  assert.equal(errorKey(t, 'known'), 'words');
  assert.equal(errorKey(t, 'unknown'), 'chat.folderEdit.err.failed');
});
