/**
 * The emoji a private call shows so the two people can compare keys
 * (R-Y196; behaviour learned from Telegram's clients, never copied).
 *
 * The four emoji come from `SHA256(key || g_a)`: its four 8-byte groups,
 * each read as a big-endian number with the top bit cleared, modulo the
 * size of the emoji table.
 *
 * The table (333 entries, in Telegram's order) is protocol data: both
 * ends must index the same list. It is taken from TDLib's
 * `get_emoji_fingerprint` (td/telegram/misc.cpp, Copyright Aliaksei
 * Levin, Arseny Smirnov; Boost Software License 1.0,
 * https://www.boost.org/LICENSE_1_0.txt), written here as code points;
 * `-` joins the code points of one entry (flags, keycaps).
 */

import crypto from 'node:crypto';

export const EMOJI_TABLE_VERIFIED = true;
export const EMOJI_COUNT = 333;

const EMOJI_CODES = `
  1F609 1F60D 1F61B 1F62D 1F631 1F621 1F60E 1F634 1F635 1F608 1F62C 1F607
  1F60F 1F46E 1F477 1F482 1F476 1F468 1F469 1F474 1F475 1F63B 1F63D 1F640
  1F47A 1F648 1F649 1F64A 1F480 1F47D 1F4A9 1F525 1F4A5 1F4A4 1F442 1F440
  1F443 1F445 1F444 1F44D 1F44E 1F44C 1F44A 270C 270B 1F450 1F446 1F447
  1F449 1F448 1F64F 1F44F 1F4AA 1F6B6 1F3C3 1F483 1F46B 1F46A 1F46C 1F46D
  1F485 1F3A9 1F451 1F452 1F45F 1F45E 1F460 1F455 1F457 1F456 1F459 1F45C
  1F453 1F380 1F484 1F49B 1F499 1F49C 1F49A 1F48D 1F48E 1F436 1F43A 1F431
  1F42D 1F439 1F430 1F438 1F42F 1F428 1F43B 1F437 1F42E 1F417 1F434 1F411
  1F418 1F43C 1F427 1F425 1F414 1F40D 1F422 1F41B 1F41D 1F41C 1F41E 1F40C
  1F419 1F41A 1F41F 1F42C 1F40B 1F410 1F40A 1F42B 1F340 1F339 1F33B 1F341
  1F33E 1F344 1F335 1F334 1F333 1F31E 1F31A 1F319 1F30E 1F30B 26A1 2614 2744
  26C4 1F300 1F308 1F30A 1F393 1F386 1F383 1F47B 1F385 1F384 1F381 1F388
  1F52E 1F3A5 1F4F7 1F4BF 1F4BB 260E 1F4E1 1F4FA 1F4FB 1F509 1F514 23F3 23F0
  231A 1F512 1F511 1F50E 1F4A1 1F526 1F50C 1F50B 1F6BF 1F6BD 1F527 1F528
  1F6AA 1F6AC 1F4A3 1F52B 1F52A 1F48A 1F489 1F4B0 1F4B5 1F4B3 2709 1F4EB
  1F4E6 1F4C5 1F4C1 2702 1F4CC 1F4CE 2712 270F 1F4D0 1F4DA 1F52C 1F52D 1F3A8
  1F3AC 1F3A4 1F3A7 1F3B5 1F3B9 1F3BB 1F3BA 1F3B8 1F47E 1F3AE 1F0CF 1F3B2
  1F3AF 1F3C8 1F3C0 26BD 26BE 1F3BE 1F3B1 1F3C9 1F3B3 1F3C1 1F3C7 1F3C6
  1F3CA 1F3C4 2615 1F37C 1F37A 1F377 1F374 1F355 1F354 1F35F 1F357 1F371
  1F35A 1F35C 1F361 1F373 1F35E 1F369 1F366 1F382 1F370 1F36A 1F36B 1F36D
  1F36F 1F34E 1F34F 1F34A 1F34B 1F352 1F347 1F349 1F353 1F351 1F34C 1F350
  1F34D 1F346 1F345 1F33D 1F3E1 1F3E5 1F3E6 26EA 1F3F0 26FA 1F3ED 1F5FB
  1F5FD 1F3A0 1F3A1 26F2 1F3A2 1F6A2 1F6A4 2693 1F680 2708 1F681 1F682 1F68B
  1F68E 1F68C 1F699 1F697 1F695 1F69B 1F6A8 1F694 1F692 1F691 1F6B2 1F6A0
  1F69C 1F6A6 26A0 1F6A7 26FD 1F3B0 1F5FF 1F3AA 1F3AD 1F1EF-1F1F5
  1F1F0-1F1F7 1F1E9-1F1EA 1F1E8-1F1F3 1F1FA-1F1F8 1F1EB-1F1F7 1F1EA-1F1F8
  1F1EE-1F1F9 1F1F7-1F1FA 1F1EC-1F1E7 31-20E3 32-20E3 33-20E3 34-20E3
  35-20E3 36-20E3 37-20E3 38-20E3 39-20E3 30-20E3 1F51F 2757 2753 2665 2666
  1F4AF 1F517 1F531 1F534 1F535 1F536 1F537
`
  .trim()
  .split(/\s+/);

// One entry as text: a lone symbol below U+3000 and a keycap's digit want
// the emoji presentation selector.
const glyph = (entry) => {
  const codes = entry.split('-').map((hex) => Number.parseInt(hex, 16));
  const select =
    codes[0] < 0x3000 && (codes.length === 1 || codes[1] === 0x20e3);
  return (
    String.fromCodePoint(codes[0]) +
    (select ? '\ufe0f' : '') +
    String.fromCodePoint(...codes.slice(1))
  );
};

export const EMOJI_TABLE = Object.freeze(EMOJI_CODES.map(glyph));

/** The four indices into the table for a key and the caller's g_a. */
export const emojiIndices = (key, ga) => {
  const digest = crypto
    .createHash('sha256')
    .update(Buffer.from(key))
    .update(Buffer.from(ga))
    .digest();
  return [0, 1, 2, 3].map((i) => {
    const part = Buffer.from(digest.subarray(i * 8, i * 8 + 8));
    part[0] &= 0x7f;
    return Number(part.readBigUInt64BE() % BigInt(EMOJI_COUNT));
  });
};

/** The four emoji of a call's key. */
export const emojiOf = (key, ga) =>
  emojiIndices(key, ga).map((index) => EMOJI_TABLE[index]);
