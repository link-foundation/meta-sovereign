// R-Z8: VK's own "Request your data" archive (messages/<peer>/messages0.html,
// Windows-1251) imports into messages with senders, times, attachments.

import { describe, it, expect } from 'test-anywhere';

import { runModuleScript } from './helpers/run-module-script.js';
import { vkSource } from '../src/sources/vk.js';
import { autoImportRecipes } from '../src/sources/auto-import/recipes.js';
import {
  decodeVkHtml,
  parseVkArchiveDate,
  peerFromArchivePath,
} from '../src/sources/vk-html-archive.js';

const MODULE = new URL('../src/sources/vk-html-archive.js', import.meta.url)
  .href;

// Text to Windows-1251 bytes (the Cyrillic letters, the rest is ASCII).
const cp1251 = (text) =>
  Uint8Array.from(
    [...text].map((ch) => {
      const code = ch.codePointAt(0);
      if (code >= 0x410 && code <= 0x44f) {
        return code - 0x350;
      }
      return { 0x401: 0xa8, 0x451: 0xb8 }[code] ?? code;
    })
  );

const PAGE = `<!DOCTYPE html><html><head><meta charset="windows-1251"><title>Сообщения</title></head><body>
<div class="wrap_page_content"><div class="page_block_header">Рабочий чат</div>
<div class="item"><div class="message" data-id="101">
<div class="message__header"><a href="https://vk.com/id7">Иван Петров</a>, 5 янв 2021 в 12:02:33</div>
<div>Привет! &quot;Как дела?&quot;<br>Вторая строка</div>
<div class="kludges"><div class="attachment"><div class="attachment__description">Фотография</div><a class="attachment__link" href="https://sun9-1.userapi.com/p.jpg">Ссылка</a></div></div>
</div></div>
<div class="item"><div class="message" data-id="102">
<div class="message__header"><a href="https://vk.com/id1">Вы</a>, 5 янв 2021 в 12:03:00 (ред.)</div>
<div>Отлично</div>
</div></div>
<div class="item"><div class="message" data-id="103">
<div class="message__header"><a href="https://vk.com/club9">Магазин</a>, 6 фев 2021 в 01:00:00</div>
<div></div>
<div class="kludges"><div class="attachment"><div class="attachment__description">Голосовое сообщение</div><a class="attachment__link" href="https://cs.vk.me/v.ogg">Ссылка</a></div></div>
</div></div>
</div></body></html>`;

describe('VK HTML archive (R-Z8)', () => {
  it('reads the Windows-1251 page: names, ids, times, text, attachments', async () => {
    const links = await vkSource.parseArchive(cp1251(PAGE));
    expect(links.length).toBe(3);
    const [first, second, third] = links;
    expect(first.id).toBe('msg:vk:101');
    expect(first.body).toBe('Привет! "Как дела?"\nВторая строка');
    expect(first.senderName).toBe('Иван Петров');
    expect(first.sender).toBe('7');
    expect(first.timestamp).toBe(
      new Date(2021, 0, 5, 12, 2, 33).getTime() / 1000
    );
    expect(first.attachments[0].kind).toBe('photo');
    expect(first.attachments[0].url).toBe('https://sun9-1.userapi.com/p.jpg');
    expect(second.outgoing).toBe(true);
    expect(second.edited).not.toBe(null);
    expect(third.sender).toBe('-9');
    expect(third.attachments[0].kind).toBe('voice');
  });

  it('gives the chat the folder name and the page title', async () => {
    const text = decodeVkHtml(cp1251(PAGE));
    const archive = autoImportRecipes.vk.toArchive(
      'Archive/messages/2000000005/messages0.html',
      text
    );
    expect(archive.conversations[0].peer.id).toBe(2000000005);
    const links = await vkSource.parseArchive(archive);
    expect(links[0].chat).toBe('2000000005');
    expect(links[0].chatName).toBe('Рабочий чат');
    expect(links[0].chatType).toBe('group');
  });

  it('the auto-import recipe takes the html pages and the JSON, not other files', () => {
    const { files, decode } = autoImportRecipes.vk;
    expect(files.test('Archive/messages/123/messages0.html')).toBe(true);
    expect(files.test('messages-export.json')).toBe(true);
    expect(files.test('Archive/photos/123/photo.html')).toBe(false);
    expect(
      decode('m/1/messages0.html', Buffer.from(cp1251(PAGE))).includes('Привет')
    ).toBe(true);
  });

  it('knows the folders and the dates', () => {
    expect(peerFromArchivePath('a/messages/c12/messages0.html')).toBe(
      2000000012
    );
    expect(peerFromArchivePath('a\\messages\\-5\\messages0.html')).toBe(-5);
    expect(parseVkArchiveDate('12 January 2024 at 14:05:09')).toBe(
      new Date(2024, 0, 12, 14, 5, 9).getTime() / 1000
    );
    expect(parseVkArchiveDate('не дата')).toBe(null);
  });

  it('reads archive times in the machine time zone, not UTC', () => {
    // The child reports its own offset: Deno on Windows ignores TZ (R-Z6).
    const zones = [
      ['Asia/Bangkok', -420, '2024-01-12T07:05:09.000Z'],
      ['UTC', 0, '2024-01-12T14:05:09.000Z'],
      ['America/Los_Angeles', 480, '2024-01-12T22:05:09.000Z'],
    ];
    for (const [zone, offset, instant] of zones) {
      const out = JSON.parse(
        runModuleScript(
          `const { parseVkArchiveDate } = await import(${JSON.stringify(MODULE)});
           console.log(JSON.stringify({
             seconds: parseVkArchiveDate('12 January 2024 at 14:05:09'),
             local: new Date(2024, 0, 12, 14, 5, 9).getTime() / 1000,
             offset: new Date(2024, 0, 12).getTimezoneOffset(),
           }));`,
          { env: { TZ: zone } }
        )
      );
      expect(out.seconds).toBe(out.local);
      if (out.offset === offset) {
        expect(new Date(out.seconds * 1000).toISOString()).toBe(instant);
      }
    }
  });
});
