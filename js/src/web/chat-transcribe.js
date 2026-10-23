// Transcribing a voice or video note, as Telegram Desktop's "→A" button
// does (R-Y175; learned, never copied): the button beside the waveform
// (or the round video) asks Telegram for the text, which shows under the
// message and which the button then hides and shows again. While
// Telegram is still working (`pending`) the text so far shows with a
// mark; the final text arrives as updateTranscribedAudio, which the
// server keeps as a `transcript:telegram:<chat>:<id>` link the page
// follows with the other links; if none comes, the page asks again after
// a few seconds. Results are kept by chat and message — here in memory,
// and on the server in that link, so a reload still has them. Telegram's
// limits show as text: Premium needed, the transcription failed, a trial
// with the free ones left, a cooldown until a date.

import React, { useEffect, useState } from 'react';
import { useLocaleContext, useT } from './i18n.js';

const el = React.createElement;

/** How long to wait for the final text before asking again (ms). */
export const ASK_AGAIN_MS = 4000;
// Asking again stops after this many tries.
const MAX_TRIES = 15;

// What is known of each message's transcription: "chat:id" -> entry.
const kept = new Map();
const listeners = new Set();

const keyOf = (chat, id) => `${chat}:${id}`;

const same = (a, b) =>
  a &&
  b &&
  a.text === b.text &&
  a.pending === b.pending &&
  a.error === b.error &&
  a.transcriptionId === b.transcriptionId &&
  a.trialRemains === b.trialRemains;

const keep = (chat, id, entry) => {
  const key = keyOf(chat, id);
  if (same(kept.get(key), entry)) {
    return;
  }
  kept.set(key, entry);
  for (const listener of listeners) {
    listener();
  }
};

/** What the page knows of a message's transcription, or undefined. */
export const transcriptOf = (chat, id) => kept.get(keyOf(chat, id));

/** Forgets everything (for tests). */
export const clearTranscripts = () => {
  kept.clear();
  for (const listener of listeners) {
    listener();
  }
};

/**
 * The transcript links among `links` (kept by the server from
 * updateTranscribedAudio and from our own asks) taken into memory.
 */
export const feedTranscripts = (links) => {
  for (const link of Array.isArray(links) ? links : []) {
    if (link?.kind === 'transcript' && link.chat && link.msgId) {
      keep(link.chat, link.msgId, {
        transcriptionId: link.transcriptionId,
        text: link.text ?? '',
        pending: Boolean(link.pending),
        trialRemains: link.trialRemains,
        trialUntil: link.trialUntil,
      });
    }
  }
};

/** Takes the transcript links of `links` into memory whenever they change. */
export const useTranscriptFeed = (links) => {
  useEffect(() => {
    feedTranscripts(links);
  }, [links]);
};

const useEntry = (chat, id) => {
  const [, bump] = useState(0);
  useEffect(() => {
    const listener = () => bump((n) => n + 1);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);
  return transcriptOf(chat, id);
};

const entryOf = (answer) =>
  answer?.ok
    ? {
        transcriptionId: answer.transcriptionId,
        text: answer.text ?? '',
        pending: Boolean(answer.pending),
        trialRemains: answer.trialRemains,
        trialUntil: answer.trialUntil,
      }
    : { text: '', pending: false, error: answer?.code ?? 'failed' };

// Asking Telegram; an answer that fails shows as an error entry.
const ask = (api, chat, id) =>
  api
    .telegramTranscribe({ chat: String(chat), id })
    .catch(() => null)
    .then((answer) => keep(chat, id, entryOf(answer)));

/**
 * One message's transcription: `{ entry, open, busy, toggle, rate }`.
 * The first press asks Telegram and opens the text; later presses hide
 * and show it. While Telegram is still working the page asks again every
 * few seconds (the final text normally arrives by itself first).
 */
export const useTranscribe = ({ api, chat, msgId, enabled = true }) => {
  const entry = useEntry(chat, msgId);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tries, setTries] = useState(0);
  const pending = open && entry?.pending === true;
  useEffect(() => {
    if (!pending || tries >= MAX_TRIES) {
      return undefined;
    }
    const timer = globalThis.setTimeout(() => {
      setTries((n) => n + 1);
      ask(api, chat, msgId);
    }, ASK_AGAIN_MS);
    return () => globalThis.clearTimeout(timer);
  }, [pending, tries, entry?.text, api, chat, msgId]);
  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!entry || entry.error) {
      setBusy(true);
      ask(api, chat, msgId).then(() => setBusy(false));
    }
  };
  const rate = (good) =>
    api.telegramTranscribeRate?.({
      chat: String(chat),
      id: msgId,
      transcriptionId: entry?.transcriptionId,
      good,
    });
  return {
    entry,
    open,
    busy,
    toggle,
    rate,
    on:
      enabled &&
      Boolean(msgId) &&
      typeof api?.telegramTranscribe === 'function',
  };
};

/** The "→A" button. */
export const TranscribeButton = ({ state }) => {
  const t = useT();
  if (!state.on) {
    return null;
  }
  return el(
    'button',
    {
      type: 'button',
      className: `audio-transcribe${state.open ? ' on' : ''}`,
      'data-action': 'transcribe',
      'aria-pressed': state.open,
      'aria-label': t('chat.transcribe.button'),
      title: t('chat.transcribe.button'),
      disabled: state.busy,
      onClick: (e) => {
        e.stopPropagation();
        state.toggle();
      },
    },
    '→A'
  );
};

const errorText = (t, code) => {
  const text = t(`chat.transcribe.err.${code}`);
  return text === `chat.transcribe.err.${code}`
    ? t('chat.transcribe.err.failed')
    : text;
};

const dateText = (seconds, locale) => {
  const at = new Date(seconds * 1000);
  try {
    return at.toLocaleString(locale);
  } catch {
    return at.toISOString();
  }
};

/** What Telegram says of the trial: the free ones left, or the cooldown. */
export const trialNote = (entry, t, locale) => {
  if (entry?.trialRemains === undefined) {
    return null;
  }
  if (entry.trialRemains > 0) {
    return t('chat.transcribe.trial', { count: entry.trialRemains });
  }
  if (!entry.trialUntil) {
    return t('chat.transcribe.trialNone');
  }
  return t('chat.transcribe.cooldown', {
    date: dateText(entry.trialUntil, locale),
  });
};

const Rating = ({ state, t }) => {
  const [rated, setRated] = useState(null);
  return el(
    'span',
    { className: 'transcript-rate' },
    [
      ['good', true, '👍'],
      ['bad', false, '👎'],
    ].map(([name, good, mark]) =>
      el(
        'button',
        {
          key: name,
          type: 'button',
          className: rated === name ? 'on' : '',
          'data-action': `transcribe-${name}`,
          'aria-label': t(`chat.transcribe.${name}`),
          title: t(`chat.transcribe.${name}`),
          disabled: rated !== null,
          onClick: () => {
            setRated(name);
            state.rate(good);
          },
        },
        mark
      )
    )
  );
};

// The words so far with the mark that more is coming, or the error.
const Words = ({ state, t }) => {
  const { entry, busy } = state;
  if (entry?.error) {
    return el(
      'span',
      { role: 'alert', className: 'transcript-error' },
      errorText(t, entry.error)
    );
  }
  const working = Boolean(entry?.pending) || (busy && !entry);
  const empty = working ? '' : t('chat.transcribe.empty');
  return el('span', { className: 'transcript-text' }, [
    entry?.text || empty,
    working
      ? el(
          'span',
          {
            key: 'p',
            className: 'transcript-pending',
            'data-transcript-pending': 'true',
            'aria-label': t('chat.transcribe.pending'),
          },
          ' …'
        )
      : null,
  ]);
};

/** The text under the message, when the button has it open. */
export const TranscriptText = ({ state }) => {
  const { t, locale } = useLocaleContext();
  const { entry, open } = state;
  if (!open || !state.on) {
    return null;
  }
  const note = trialNote(entry, t, locale);
  const final = entry && !entry.pending && !entry.error && entry.text;
  return el(
    'div',
    {
      className: 'transcript',
      'data-transcript': entry?.pending ? 'pending' : 'ready',
    },
    [
      el(Words, { key: 'w', state, t }),
      note
        ? el('span', { key: 'n', className: 'transcript-trial' }, note)
        : null,
      final && entry.transcriptionId
        ? el(Rating, { key: 'r', state, t })
        : null,
    ]
  );
};

/**
 * A voice note's row or a round video's circle with its "→A" button and
 * the text under it; just the child when the message cannot be
 * transcribed. `round`: the button sits beside the circle.
 */
export const Transcribable = ({ state, round = false, children }) => {
  if (!state.on) {
    return children;
  }
  return el('div', { className: 'transcribable' }, [
    round
      ? el('div', { key: 'line', className: 'round-line' }, [
          children,
          el(TranscribeButton, { key: 'words', state }),
        ])
      : children,
    el(TranscriptText, { key: 'text', state }),
  ]);
};
