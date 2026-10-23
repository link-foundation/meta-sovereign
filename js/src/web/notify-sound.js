// The sound of a notification, as Telegram Desktop plays it (R-Y181;
// learned, never copied): a chat has the default sound, none, or one of
// the account's saved ringtones; the page plays the chat's when it shows
// a notification. A ringtone is downloaded once and kept for the page's
// life; the default is a short two-note chime made here, so nothing is
// shipped. A failure to play (a browser that wants a click first) is
// silent, never an error.

export const SOUND_KEY = 'metaSovereignNotifySound';

/** 'default', 'none' or a ringtone's id, from a chat's notify rules. */
export const soundOf = (chat, rules) => {
  if (chat?.source !== 'telegram') {
    return 'default';
  }
  return rules?.exceptions?.get(String(chat.chat))?.sound ?? 'default';
};

const RATE = 22050;

// A tone as 16-bit samples with a quick fade, for the chime.
const tone = (hz, seconds) => {
  const n = Math.round(RATE * seconds);
  return Array.from({ length: n }, (_, i) => {
    const fade = Math.min(1, i / 200, (n - i) / (RATE * 0.12));
    return Math.round(Math.sin((2 * Math.PI * hz * i) / RATE) * 9000 * fade);
  });
};

/** The default chime as a WAV `Uint8Array`. */
export const chimeWav = () => {
  const samples = [...tone(880, 0.14), ...tone(1175, 0.22)];
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (at, value) =>
    [...value].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((v, i) => view.setInt16(44 + i * 2, v, true));
  return bytes;
};

let chime = null;
const chimeUrl = () => {
  if (!chime) {
    const blob = new globalThis.Blob([chimeWav()], { type: 'audio/wav' });
    chime = globalThis.URL.createObjectURL(blob);
  }
  return chime;
};

// ringtone id -> the promise of its address, asked once.
const ringtones = new Map();
const ringtoneUrl = (api, id) => {
  if (!ringtones.has(id)) {
    ringtones.set(
      id,
      Promise.resolve(api?.telegramRingtoneUrl?.({ id }))
        .then((url) => url ?? null)
        .catch(() => null)
    );
  }
  return ringtones.get(id);
};

/** Forgets the kept addresses (a removed ringtone, a test). */
export const forgetRingtones = () => ringtones.clear();

const play = (src) => {
  try {
    const audio = new globalThis.Audio(src);
    audio.crossOrigin = /^https?:/.test(src) ? 'anonymous' : null;
    return Promise.resolve(audio.play()).then(
      () => true,
      () => false
    );
  } catch {
    return Promise.resolve(false);
  }
};

/**
 * Plays a chat's sound: 'none' nothing, a ringtone's id that ringtone
 * (the default chime when it cannot be had), anything else the chime.
 * Resolves to what played: 'none', 'default' or the id.
 */
export const playNotifySound = async (api, sound, player = play) => {
  if (sound === 'none') {
    return 'none';
  }
  if (/^\d+$/.test(String(sound))) {
    const url = await ringtoneUrl(api, String(sound));
    if (url && (await player(url))) {
      return String(sound);
    }
  }
  await player(chimeUrl());
  return 'default';
};
