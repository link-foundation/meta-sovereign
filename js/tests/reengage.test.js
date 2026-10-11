import { describe, it, expect } from 'test-anywhere';
import {
  DAY_MS,
  buildReengageRecord,
  createAdapterSender,
  createReengageSession,
  defaultReengageTemplates,
  detectSelfIds,
  findDormantContacts,
  planReengagement,
  prefillLinkFor,
  renderReengageText,
  withAddressForm,
} from '../src/crm/reengage.js';
import { buildMessageLink } from '../src/sources/link.js';
import { telegramSource } from '../src/sources/telegram.js';

const NOW = Date.parse('2026-10-01T00:00:00Z');
const daysAgo = (n) => new Date(NOW - n * DAY_MS).toISOString();

let seq = 0;
const m = (source, chat, sender, body, ago, extra = {}) =>
  buildMessageLink({
    source,
    externalId: String((seq += 1)),
    sender,
    chat,
    body,
    timestamp: daysAgo(ago),
    ...extra,
  });

const fixture = () => [
  // Dormant 1:1 on "ты" (120 days).
  m('vk', '101', 'me', 'Привет! Как ты?', 125),
  m('vk', '101', 'alice', 'Норм, а ты что делаешь?', 120),
  // Dormant 1:1 on "вы" (200 days).
  m('vk', '102', 'me', 'Здравствуйте! Вы сможете прислать ваше резюме?', 200),
  m('vk', '102', 'bob', 'Да, конечно', 200),
  // Recent 1:1 — not dormant.
  m('vk', '103', 'me', 'Привет', 10),
  m('vk', '103', 'carol', 'Привет!', 10),
  // Group chat (VK peer >= 2e9) — never a personal contact.
  m('vk', '2000000001', 'me', 'Всем привет', 300),
  m('vk', '2000000001', 'dave', 'Привет', 300),
  // A stranger who wrote once and was never answered.
  m('vk', '104', 'spam', 'Купи', 400),
];

describe('findDormantContacts', () => {
  it('keeps only personal dialogs silent for at least 90 days', () => {
    const { contacts } = findDormantContacts(fixture(), { now: NOW });
    expect(contacts.map((c) => c.contact).sort()).toEqual(['alice', 'bob']);
    const alice = contacts.find((c) => c.contact === 'alice');
    expect(alice.daysSilent).toBe(120);
    expect(alice.lastFrom).toBe('contact');
  });
  it('treats exactly 90 days as dormant and 89 as active', () => {
    const links = [
      m('vk', '201', 'me', 'a', 90),
      m('vk', '202', 'me', 'b', 89),
      m('vk', '201', 'x', 'c', 95),
      m('vk', '202', 'y', 'd', 95),
    ];
    const { contacts } = findDormantContacts(links, { now: NOW });
    expect(contacts.map((c) => c.chat)).toEqual(['201']);
  });
  it('includes unanswered contacts only when requireMutual is off', () => {
    const { contacts } = findDormantContacts(fixture(), {
      now: NOW,
      requireMutual: false,
    });
    expect(contacts.some((c) => c.contact === 'spam')).toBe(true);
  });
  it('honours a custom threshold and a network filter', () => {
    const all = findDormantContacts(fixture(), { now: NOW, days: 5 });
    expect(all.contacts.length).toBe(3);
    const none = findDormantContacts(fixture(), {
      now: NOW,
      networks: ['telegram'],
    });
    expect(none.contacts.length).toBe(0);
  });
  it('uses adapter chat types: group types are excluded', () => {
    const links = [
      m('telegram', 'g1', 'user1', 'привет', 100, {
        chatType: 'private_group',
      }),
      m('telegram', 'g1', 'user2', 'привет', 100, {
        chatType: 'private_group',
      }),
    ];
    const { contacts } = findDormantContacts(links, {
      now: NOW,
      self: ['user1'],
    });
    expect(contacts.length).toBe(0);
  });
});

describe('detectSelfIds', () => {
  it('takes the sender present in the most chats as the owner', () => {
    const links = [
      m('telegram', 'c1', 'user1', 'a', 100),
      m('telegram', 'c1', 'user7', 'b', 100),
      m('telegram', 'c2', 'user1', 'c', 100),
      m('telegram', 'c2', 'user8', 'd', 100),
    ];
    expect([...detectSelfIds(links)].sort()).toEqual(['me', 'user1']);
    expect([...detectSelfIds(links, ['user7'])].sort()).toEqual([
      'me',
      'user7',
    ]);
  });
  it('needs at least two chats to guess', () => {
    const links = [m('telegram', 'c1', 'user1', 'a', 100)];
    expect([...detectSelfIds(links)]).toEqual(['me']);
  });
});

describe('Telegram export → dormant contacts', () => {
  it('reads chat type and name from a Telegram Desktop export', async () => {
    const archive = {
      chats: {
        list: [
          {
            id: 55,
            name: 'Иван',
            type: 'personal_chat',
            messages: [
              {
                id: 1,
                type: 'message',
                date: daysAgo(150),
                from: 'Я',
                from_id: 'user1',
                text: 'Привет, ты как?',
              },
              {
                id: 2,
                type: 'message',
                date: daysAgo(149),
                from: 'Иван',
                from_id: 'user55',
                text: 'Норм',
              },
            ],
          },
        ],
      },
    };
    const links = await telegramSource.parseArchive(archive);
    expect(links[0].chatType).toBe('personal_chat');
    expect(links[0].chatName).toBe('Иван');
    const plan = planReengagement(links, { now: NOW, self: ['user1'] });
    expect(plan.drafts.length).toBe(1);
    expect(plan.drafts[0].name).toBe('Иван');
    expect(plan.drafts[0].form).toBe('informal');
    expect(plan.drafts[0].prefill.url).toBe('tg://user?id=55');
  });
});

describe('planReengagement', () => {
  it('chooses the template that matches the dialog form', () => {
    const plan = planReengagement(fixture(), { now: NOW });
    const byContact = Object.fromEntries(
      plan.drafts.map((d) => [d.contact, d])
    );
    expect(byContact.alice.form).toBe('informal');
    expect(byContact.alice.text).toBe(defaultReengageTemplates.informal);
    expect(byContact.bob.form).toBe('formal');
    expect(byContact.bob.text).toBe(defaultReengageTemplates.formal);
    expect(byContact.bob.addressForm.reason).toBe('majority');
    expect(plan.mode).toBe('safe');
  });
  it('skips contacts that were messaged or skipped within the cooldown', () => {
    const links = fixture();
    const first = planReengagement(links, { now: NOW });
    const alice = first.drafts.find((d) => d.contact === 'alice');
    links.push(buildReengageRecord(alice, { status: 'sent', at: daysAgo(3) }));
    const second = planReengagement(links, { now: NOW });
    expect(second.drafts.some((d) => d.contact === 'alice')).toBe(false);
    expect(second.excluded[0].reason).toBe('already-sent');
    const later = planReengagement(links, { now: NOW + 100 * DAY_MS });
    expect(later.drafts.some((d) => d.contact === 'alice')).toBe(true);
  });
  it('does not treat a failed attempt as done', () => {
    const links = fixture();
    const alice = planReengagement(links, { now: NOW }).drafts.find(
      (d) => d.contact === 'alice'
    );
    links.push(
      buildReengageRecord(alice, { status: 'failed', at: daysAgo(1) })
    );
    const plan = planReengagement(links, { now: NOW });
    expect(plan.drafts.some((d) => d.contact === 'alice')).toBe(true);
  });
  it('applies address:* patterns from the store', () => {
    const links = [
      m('vk', '301', 'me', 'Бро, го', 100),
      m('vk', '301', 'eve', 'го', 100),
      {
        id: 'pattern:bro',
        tokens: ['pattern', 'bro', 'address:informal'],
        regex: 'бро',
      },
    ];
    const plan = planReengagement(links, { now: NOW });
    expect(plan.drafts[0].form).toBe('informal');
  });
  it('limits the number of drafts', () => {
    const plan = planReengagement(fixture(), { now: NOW, limit: 1 });
    expect(plan.drafts.length).toBe(1);
    expect(plan.total).toBe(2);
  });
  it('rejects unknown modes', () => {
    expect(() => planReengagement([], { mode: 'yolo' })).toThrow();
  });
});

describe('renderReengageText / prefillLinkFor', () => {
  it('fills {name} and drops a dangling comma when it is unknown', () => {
    expect(renderReengageText('Привет, {name}!', { name: 'Аня' })).toBe(
      'Привет, Аня!'
    );
    expect(renderReengageText('Привет, {name}!', {})).toBe('Привет!');
    expect(renderReengageText('Hi {name}\n\nok', {})).toBe('Hi\n\nok');
  });
  it('builds an RFC 6068 mailto link with CRLF line breaks', () => {
    const link = prefillLinkFor({
      source: 'email',
      contact: 'a@b.c',
      text: 'Hi\nthere',
    });
    expect(link.url).toBe('mailto:a@b.c?body=Hi%0D%0Athere');
    expect(link.prefillsText).toBe(true);
    expect(prefillLinkFor({ source: 'vk', contact: '1', text: 'x' }).url).toBe(
      'https://vk.com/im?sel=1'
    );
    expect(prefillLinkFor({ source: 'slack', contact: 'U1', text: 'x' })).toBe(
      null
    );
  });
  it('re-renders a draft for the other form', () => {
    const draft = planReengagement(fixture(), { now: NOW }).drafts[0];
    const flipped = withAddressForm(
      draft,
      draft.form === 'formal' ? 'informal' : 'formal',
      defaultReengageTemplates
    );
    expect(flipped.text === draft.text).toBe(false);
  });
});

describe('createReengageSession', () => {
  const drafts = () => planReengagement(fixture(), { now: NOW }).drafts;

  it('safe mode sends exactly one message per confirmation', async () => {
    const sent = [];
    const records = [];
    const session = createReengageSession({
      drafts: drafts(),
      send: async (d) => {
        sent.push(d.contact);
        return { ok: true };
      },
      record: async (link) => records.push(link),
    });
    expect(session.mode).toBe('safe');
    let error = null;
    try {
      await session.sendAll();
    } catch (e) {
      error = e;
    }
    expect(error?.code).toBe('safe-mode');
    expect(sent.length).toBe(0);
    const first = await session.confirm();
    expect(first.status).toBe('sent');
    expect(sent.length).toBe(1);
    expect(records[0].id.startsWith('reengage:vk:')).toBe(true);
    expect(session.progress().remaining).toBe(1);
  });
  it('the debug alias behaves like safe mode', () => {
    expect(createReengageSession({ mode: 'debug' }).mode).toBe('safe');
  });
  it('a failed send keeps the draft current for retry or manual send', async () => {
    let fail = true;
    const session = createReengageSession({
      drafts: drafts(),
      send: async () => {
        if (fail) {
          throw new Error('network down');
        }
        return { ok: true };
      },
    });
    const before = session.current().id;
    const failed = await session.confirm();
    expect(failed.status).toBe('failed');
    expect(failed.error).toBe('network down');
    expect(session.current().id).toBe(before);
    fail = false;
    await session.confirm();
    const progress = session.progress();
    expect([progress.sent, progress.failed]).toEqual([1, 1]);
  });
  it('supports edit, form switch, manual mark and skip', async () => {
    const records = [];
    const session = createReengageSession({
      drafts: drafts(),
      record: async (link) => records.push(link),
    });
    session.edit('Свой текст');
    expect(session.current().text).toBe('Свой текст');
    const manual = await session.markSent();
    expect(manual.record.manual).toBe(true);
    expect(manual.record.text).toBe('Свой текст');
    session.setForm('informal');
    expect(session.current().text).toBe(defaultReengageTemplates.informal);
    await session.skip();
    expect(session.progress().done).toBe(true);
    expect(records.map((r) => r.status)).toEqual(['sent', 'skipped']);
    let error = null;
    try {
      await session.confirm();
    } catch (e) {
      error = e;
    }
    expect(error).not.toBe(null);
  });
  it('batch mode sends everything and continues past failures', async () => {
    const session = createReengageSession({
      drafts: drafts(),
      mode: 'batch',
      send: async (d) => {
        if (d.contact === 'bob') {
          throw new Error('blocked');
        }
        return { ok: true };
      },
    });
    const results = await session.sendAll();
    expect(results.map((r) => r.status).sort()).toEqual(['failed', 'sent']);
    expect(session.progress().done).toBe(true);
  });
});

describe('createAdapterSender', () => {
  it('posts through live.post and refuses adapters that cannot send', async () => {
    const posted = [];
    const send = createAdapterSender({
      getSource: (name) =>
        name === 'vk'
          ? { live: { post: async (c) => posted.push(c) && { ok: true } } }
          : { live: {} },
    });
    const [draft] = drafts();
    await send(draft);
    expect([posted[0].chat, posted[0].text]).toEqual([draft.chat, draft.text]);
    let error = null;
    try {
      await send({ ...draft, source: 'linkedin' });
    } catch (e) {
      error = e;
    }
    expect(error.message.includes('cannot send')).toBe(true);
  });
  function drafts() {
    return planReengagement(fixture(), { now: NOW }).drafts;
  }
});

describe('planReengagement defaults', () => {
  it('ignores options explicitly set to undefined', () => {
    const plan = planReengagement(fixture(), {
      now: NOW,
      days: undefined,
      templates: undefined,
    });
    expect(plan.days).toBe(90);
    expect(plan.drafts.length).toBe(2);
  });
});
