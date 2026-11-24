// The sound of a notification, as Telegram Desktop plays it (R-Y181;
// learned, never copied): a chat has the default sound, none, or one of
// the account's saved ringtones; the page plays the chat's when it shows
// a notification. A ringtone is downloaded once and kept for the page's
// life. The default two-note chime is a same-origin asset so it can
// play under the app's media policy. Playback refusals are silent.

export const SOUND_KEY = 'metaSovereignNotifySound';

/** 'default', 'none' or a ringtone's id, from a chat's notify rules. */
export const soundOf = (chat, rules) => {
  if (chat?.source !== 'telegram') {
    return 'default';
  }
  return rules?.exceptions?.get(String(chat.chat))?.sound ?? 'default';
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
  return (await player('./notification-chime.wav')) ? 'default' : 'none';
};
