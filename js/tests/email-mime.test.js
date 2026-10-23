// Reading real-world raw mail (R-Z5): Apple Mail, Outlook, Gmail and
// Thunderbird style messages written out here, with koi8-r and
// windows-1251 bodies, Q- and B-encoded headers, nested multiparts,
// attachments and inline pictures. Nothing touches a network.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseEmailArchive,
  parseRfc822Message,
  setAttachmentSink,
} from '../src/sources/email.js';
import {
  decodeHeaderValue,
  threadKey,
  messageIds,
} from '../src/sources/email-mime.js';
import { htmlToSafe } from '../src/sources/email-html.js';

const crlf = (lines) => lines.join('\r\n');

const koi8r = (text) => {
  // "Привет, мир" in koi8-r, byte by byte.
  const table = {
    П: 0xf0,
    р: 0xd2,
    и: 0xc9,
    в: 0xd7,
    е: 0xc5,
    т: 0xd4,
    м: 0xcd,
    ' ': 0x20,
    ',': 0x2c,
  };
  return Buffer.from([...text].map((c) => table[c]));
};

const cp1251 = (text) =>
  Buffer.from(
    [...text].map((c) => {
      const code = c.charCodeAt(0);
      return code >= 0x410 && code <= 0x44f ? code - 0x410 + 0xc0 : code;
    })
  );

describe('Apple Mail style: mixed-case boundary, alternative, attachment', () => {
  const raw = crlf([
    'From: =?utf-8?Q?=D0=90=D0=BD=D0=BD=D0=B0?= <anna@example.com>',
    'Content-Type: multipart/mixed; boundary="Apple-Mail=_7F5E1E56-0C3B-4F51-9A5A-ABCDEF012345"',
    'Subject: =?UTF-8?Q?=D0=9F=D1=80=D0=B8=D0=B2=D0=B5=D1=82?=',
    'Message-Id: <apple-1@example.com>',
    'Date: Sat, 24 Oct 2026 10:00:00 +0000',
    'To: Bob <bob@example.com>',
    'Mime-Version: 1.0 (Mac OS X Mail 16.0)',
    '',
    '--Apple-Mail=_7F5E1E56-0C3B-4F51-9A5A-ABCDEF012345',
    'Content-Type: multipart/alternative; boundary="Apple-Mail=_ALT-1"',
    '',
    '--Apple-Mail=_ALT-1',
    'Content-Transfer-Encoding: 7bit',
    'Content-Type: text/plain; charset=us-ascii',
    '',
    'Plain hello',
    '--Apple-Mail=_ALT-1',
    'Content-Type: text/html; charset=us-ascii',
    '',
    '<html><body><b>Bold</b> hello <a href="https://example.com/x">link</a></body></html>',
    '--Apple-Mail=_ALT-1--',
    '--Apple-Mail=_7F5E1E56-0C3B-4F51-9A5A-ABCDEF012345',
    'Content-Disposition: attachment; filename=report.pdf',
    'Content-Type: application/pdf; name=report.pdf',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from('%PDF-1.4 fake').toString('base64'),
    '--Apple-Mail=_7F5E1E56-0C3B-4F51-9A5A-ABCDEF012345--',
    '',
  ]);

  it('keeps the boundary case and finds body and attachment', () => {
    const link = parseRfc822Message(Buffer.from(raw));
    assert.equal(link.body, 'Plain hello');
    assert.equal(link.subject, 'Привет');
    assert.equal(link.senderName, 'Анна');
    assert.equal(link.attachments.length, 1);
    assert.equal(link.attachments[0].name, 'report.pdf');
    assert.equal(link.attachments[0].mime, 'application/pdf');
    assert.equal(link.attachments[0].size, '%PDF-1.4 fake'.length);
  });

  it('keeps the HTML as a safe tree beside the text', () => {
    const link = parseRfc822Message(Buffer.from(raw));
    const flat = JSON.stringify(link.bodyTree);
    assert.match(flat, /"t":"b"/);
    assert.match(flat, /"href":"https:\/\/example.com\/x"/);
  });

  it('works from a string too (text the page already decoded)', () => {
    const link = parseRfc822Message(raw);
    assert.equal(link.body, 'Plain hello');
    assert.equal(link.attachments[0].name, 'report.pdf');
  });
});

describe('Outlook style: related + alternative, cid picture, windows-1251', () => {
  const html =
    '<html><body><p>Здравствуйте</p><img src="cid:image001.png@01D9A1B2.C3D4E5F0"></body></html>';
  const raw = Buffer.concat([
    Buffer.from(
      crlf([
        'From: "Ivanov, Ivan" <ivan@corp.example>',
        'Subject: =?windows-1251?B?z/Do4uXy?=',
        'Message-ID: <OUTLOOK-1@corp.example>',
        'Content-Type: multipart/related; boundary="_004_AB12CD34_"; type="multipart/alternative"',
        'MIME-Version: 1.0',
        '',
        '--_004_AB12CD34_',
        'Content-Type: multipart/alternative; boundary="_000_AB12CD34_"',
        '',
        '--_000_AB12CD34_',
        'Content-Type: text/plain; charset="windows-1251"',
        'Content-Transfer-Encoding: quoted-printable',
        '',
        '=C7=E4=F0=E0=E2=F1=F2=E2=F3=E9=F2=E5',
        '--_000_AB12CD34_',
        'Content-Type: text/html; charset="windows-1251"',
        'Content-Transfer-Encoding: 8bit',
        '',
        '',
      ])
    ),
    cp1251(html),
    Buffer.from(
      crlf([
        '',
        '--_000_AB12CD34_--',
        '--_004_AB12CD34_',
        'Content-Type: image/png; name="image001.png"',
        'Content-Description: image001.png',
        'Content-Disposition: inline; filename="image001.png"; size=4',
        'Content-ID: <image001.png@01D9A1B2.C3D4E5F0>',
        'Content-Transfer-Encoding: base64',
        '',
        'iVBORw==',
        '--_004_AB12CD34_--',
        '',
      ])
    ),
  ]);

  it('decodes windows-1251 text, B-encoded subject and a quoted name', () => {
    const link = parseRfc822Message(raw);
    assert.equal(link.subject, 'Привет');
    assert.equal(link.body, 'Здравствуйте');
    assert.deepEqual(link.from, [
      { name: 'Ivanov, Ivan', address: 'ivan@corp.example' },
    ]);
  });

  it('shows the 8bit windows-1251 HTML and names the inline picture by cid', () => {
    const link = parseRfc822Message(raw);
    const flat = JSON.stringify(link.bodyTree);
    assert.match(flat, /Здравствуйте/);
    assert.match(flat, /"cid":"image001.png@01D9A1B2.C3D4E5F0"/);
    const picture = link.attachments.find((a) => a.cid);
    assert.equal(picture.name, 'image001.png');
    assert.equal(picture.mime, 'image/png');
    assert.equal(picture.inline, true);
    assert.equal(picture.size, 4);
  });
});

describe('Gmail style: base64 UTF-8 body, Q header, long boundary', () => {
  it('reads it', () => {
    const body = 'Привет из Gmail\r\nВторая строка';
    const raw = crlf([
      'MIME-Version: 1.0',
      'From: =?UTF-8?Q?Anna_=D0=9F?= <anna@gmail.com>',
      `Subject: =?UTF-8?B?${Buffer.from('Привет, мир').toString('base64')}?=`,
      'Message-ID: <CAF=abc123@mail.gmail.com>',
      'Content-Type: multipart/alternative; boundary="000000000000a1B2c3"',
      '',
      '--000000000000a1B2c3',
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(body).toString('base64'),
      '--000000000000a1B2c3--',
      '',
    ]);
    const link = parseRfc822Message(Buffer.from(raw));
    assert.equal(link.subject, 'Привет, мир');
    assert.equal(link.senderName, 'Anna П');
    assert.equal(link.body, body);
    assert.equal(link.id, 'msg:email:CAF=abc123@mail.gmail.com');
  });
});

describe('Thunderbird style: nested mixed > alternative, koi8-r 8bit', () => {
  const raw = Buffer.concat([
    Buffer.from(
      crlf([
        'Message-ID: <tb-3@example.org>',
        'References: <root@example.org> <tb-2@example.org>',
        'In-Reply-To: <tb-2@example.org>',
        'From: Petr <petr@example.org>',
        'Subject: Re: Re: =?KOI8-R?B?8NLJ18XU?=',
        'Content-Type: multipart/mixed; boundary="------------040101010605010203050709"',
        '',
        '--------------040101010605010203050709',
        'Content-Type: text/plain; charset=KOI8-R; format=flowed',
        'Content-Transfer-Encoding: 8bit',
        '',
        '',
      ])
    ),
    koi8r('Привет, мир'),
    Buffer.from(crlf(['', '--------------040101010605010203050709--', ''])),
  ]);

  it('decodes koi8-r and puts the reply in its thread', () => {
    const link = parseRfc822Message(raw);
    assert.equal(link.body, 'Привет, мир');
    assert.equal(link.subject, 'Re: Re: Привет');
    assert.equal(link.chatName, 'Привет');
    // The thread is the root of References, not the garbage of a
    // two-id header.
    assert.equal(link.chat, 'root@example.org');
    assert.deepEqual(link.references, ['root@example.org', 'tb-2@example.org']);
    assert.equal(link.replyTo, 'tb-2@example.org');
  });

  it('reads an mbox file as bytes with the same charset', async () => {
    const mbox = Buffer.concat([
      Buffer.from('From petr@example.org Sat Oct 24 10:00:00 2026\n'),
      raw,
      Buffer.from('\nFrom nobody@example.org Sat Oct 24 11:00:00 2026\n'),
      Buffer.from('Message-ID: <two@example.org>\nSubject: two\n\nhi\n'),
    ]);
    const links = await parseEmailArchive(new Uint8Array(mbox));
    assert.equal(links.length, 2);
    assert.equal(links[0].body, 'Привет, мир');
    assert.equal(links[1].body, 'hi');
  });
});

describe('legacy charsets and encodings', () => {
  const cases = [
    ['iso-8859-1', Buffer.from([0x63, 0x61, 0x66, 0xe9]), 'café'],
    ['iso-8859-2', Buffer.from([0xb1, 0xe6]), 'ąć'],
    ['windows-1252', Buffer.from([0x80]), '€'],
    ['shift_jis', Buffer.from([0x82, 0xb1, 0x82, 0xf1]), 'こん'],
    ['gb2312', Buffer.from([0xc4, 0xe3, 0xba, 0xc3]), '你好'],
  ];
  for (const [charset, bytes, expected] of cases) {
    it(`decodes ${charset}`, () => {
      const raw = Buffer.concat([
        Buffer.from(
          `Subject: x\r\nContent-Type: text/plain; charset=${charset}\r\nContent-Transfer-Encoding: 8bit\r\n\r\n`
        ),
        bytes,
      ]);
      assert.equal(parseRfc822Message(raw).body, expected);
    });
  }

  it('decodes adjacent encoded words and a character split across them', () => {
    const [first, second] = [
      Buffer.from('Пр', 'utf8'),
      Buffer.from('ивет', 'utf8'),
    ];
    // "П" is two bytes; cut the stream in the middle of "р".
    const bytes = Buffer.concat([first, second]);
    const a = bytes.subarray(0, 3);
    const b = bytes.subarray(3);
    const header = `=?UTF-8?B?${a.toString('base64')}?= \r\n =?UTF-8?B?${b.toString('base64')}?=`;
    assert.equal(decodeHeaderValue(header), 'Привет');
  });

  it('decodes a Q word in koi8-r with an underscore for a space', () => {
    assert.equal(
      decodeHeaderValue('=?koi8-r?Q?=F0=D2=C9=D7=C5=D4_=CD=C9=D2?='),
      'Привет мир'
    );
  });

  it('drops the space between encoded words of different charsets', () => {
    assert.equal(
      decodeHeaderValue(
        '=?koi8-r?B?8NLJ18XU?= =?windows-1251?Q?=CF=F0=E8=E2=E5=F2?= tail'
      ),
      'ПриветПривет tail'
    );
  });

  it('falls back to UTF-8 for an unknown charset label', () => {
    const raw = Buffer.from(
      'Content-Type: text/plain; charset=x-nonsense\r\n\r\nhéllo'
    );
    assert.equal(parseRfc822Message(raw).body, 'héllo');
  });

  it('reads RFC 2231 filenames, plain and continued', () => {
    const raw = crlf([
      'Subject: files',
      'Content-Type: multipart/mixed; boundary=B',
      '',
      '--B',
      "Content-Disposition: attachment; filename*=utf-8''%D0%9E%D1%82%D1%87%D1%91%D1%82.txt",
      'Content-Type: text/plain',
      '',
      'abc',
      '--B',
      'Content-Disposition: attachment;',
      "  filename*0*=utf-8''%D0%94%D0%BB%D0%B8;",
      '  filename*1*=%D0%BD%D0%BD%D1%8B%D0%B9.txt',
      'Content-Type: application/octet-stream',
      '',
      'xyz',
      '--B--',
      '',
    ]);
    const names = parseRfc822Message(Buffer.from(raw)).attachments.map(
      (a) => a.name
    );
    assert.deepEqual(names, ['Отчёт.txt', 'Длинный.txt']);
  });
});

describe('threading', () => {
  it('parses several ids in one header', () => {
    assert.deepEqual(messageIds('<a@x> <b@x>\r\n <c@x>'), [
      'a@x',
      'b@x',
      'c@x',
    ]);
    assert.deepEqual(messageIds(' a@x '), ['a@x']);
  });

  const mail = (extra) =>
    parseRfc822Message(
      Buffer.from(crlf([...extra, 'Subject: Hi', '', 'text']))
    );

  it('puts a root, its reply and a later reply in one thread', () => {
    const root = mail(['Message-ID: <a@x>']);
    const reply = mail([
      'Message-ID: <b@x>',
      'In-Reply-To: <a@x>',
      'References: <a@x>',
    ]);
    const third = mail([
      'Message-ID: <c@x>',
      'In-Reply-To: <b@x>',
      'References: <a@x> <b@x>',
    ]);
    assert.equal(root.chat, 'a@x');
    assert.equal(reply.chat, 'a@x');
    assert.equal(third.chat, 'a@x');
  });

  it('uses In-Reply-To when there is no References', () => {
    assert.equal(mail(['Message-ID: <b@x>', 'In-Reply-To: <a@x>']).chat, 'a@x');
  });

  it('falls back to the plain subject only when there are no ids', () => {
    assert.equal(threadKey({ subject: 'RE: Fwd: Hello' }), 'hello');
    assert.equal(threadKey({ messageId: 'm@x', subject: 'Hello' }), 'm@x');
    const noIds = parseRfc822Message(
      Buffer.from('Subject: Re: Lunch\r\n\r\nx')
    );
    assert.equal(noIds.chat, 'lunch');
  });
});

describe('HTML is data, never markup', () => {
  const safe = (html) => JSON.stringify(htmlToSafe(html).tree);

  it('drops scripts, styles, handlers, forms and frames', () => {
    const tree = safe(
      '<p onclick="x()">a</p><script>alert(1)</script><style>p{}</style>' +
        '<iframe src="https://evil"></iframe><form action="/x"><input></form>'
    );
    assert.doesNotMatch(tree, /alert|onclick|iframe|evil|script|style/);
  });

  it('keeps only http, https, mailto and tel links', () => {
    const tree = safe(
      '<a href="javascript:alert(1)">j</a><a href=" JaVaScRiPt:1">k</a>' +
        '<a href="data:text/html,x">d</a><a href="https://ok.example/a?b=1&amp;c=2">ok</a>' +
        '<a href="mailto:a@b.c">m</a>'
    );
    assert.doesNotMatch(tree, /javascript|data:/i);
    assert.match(tree, /https:\/\/ok.example\/a\?b=1&c=2/);
    assert.match(tree, /mailto:a@b.c/);
  });

  it('never loads a remote picture (a tracking pixel)', () => {
    const tree = safe(
      '<img src="https://track.example/p.gif" alt="logo"><img src="http://t/x.gif" width=1>'
    );
    assert.doesNotMatch(tree, /track|http:\/\/t/);
    assert.match(tree, /\[logo\]/);
  });

  it('turns lists, quotes and links into readable text', () => {
    const { text } = htmlToSafe(
      '<p>Hi</p><ul><li>one</li><li>two</li></ul><blockquote>old</blockquote><a href="https://a.example/x">site</a>'
    );
    assert.match(text, /• one\n• two/);
    assert.match(text, /> old/);
    assert.match(text, /site \(https:\/\/a.example\/x\)/);
  });

  it('survives a deeply nested and a huge document', () => {
    const deep = `${'<div>'.repeat(500)}x${'</div>'.repeat(500)}`;
    assert.ok(htmlToSafe(deep).text.includes('x'));
    const huge = '<p>a</p>'.repeat(20000);
    const result = htmlToSafe(huge);
    assert.equal(result.tree, null);
    assert.ok(result.text.length > 0);
  });
});

describe('attachment sink', () => {
  it('hands the decoded bytes to the sink and records its id', () => {
    const seen = [];
    setAttachmentSink((bytes, meta) => {
      seen.push([Buffer.from(bytes).toString(), meta.name]);
      return 'abc123';
    });
    const raw = crlf([
      'Subject: f',
      'Content-Type: multipart/mixed; boundary=B',
      '',
      '--B',
      'Content-Type: text/plain',
      '',
      'body',
      '--B',
      'Content-Type: application/zip; name="a.zip"',
      'Content-Disposition: attachment; filename="a.zip"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from('ZIPDATA').toString('base64'),
      '--B--',
      '',
    ]);
    let link;
    try {
      link = parseRfc822Message(Buffer.from(raw));
    } finally {
      setAttachmentSink(null); // (Deno has no `afterEach`)
    }
    assert.deepEqual(seen, [['ZIPDATA', 'a.zip']]);
    assert.equal(link.attachments[0].file, 'abc123');
    assert.equal(link.body, 'body');
  });
});
