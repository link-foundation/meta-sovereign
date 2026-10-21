/**
 * A poll, a quiz and a checklist in a chat, as Telegram's apps have them
 * (R-Y74; ./poll-parts.js reads them):
 *
 * - Not voted yet: a circle per answer (a box when several may be
 *   chosen). One answer votes at once; several are ticked, then Vote.
 * - Voted, or closed: each answer's share (whole percents adding up to
 *   100), a bar, and a tick on ours; a quiz shows the right answer in
 *   green and a wrong pick of ours in red, with its explanation (💡).
 * - Its kind ("Anonymous Poll", "Quiz", "Final results"), the last
 *   voters' photos in a public poll, the time left when it closes by
 *   itself, and "N votes" — or View results, who voted for what.
 * - Telegram sends a poll's results only to who asks: a poll on screen
 *   asks for them now and then (POLL_REFRESH_MS), as Desktop does.
 * - A checklist: a box per task, ticked by whoever did it.
 *
 * Retract vote and Stop poll are in the message's menu
 * (./chat-selection.js).
 */

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { PeerAvatar } from './peer-avatar.js';
import { nicePercents, showsResults } from './poll-parts.js';

const el = React.createElement;

// How often a poll on screen asks for its results; once per poll for
// the whole page, however many times it is drawn.
export const POLL_REFRESH_MS = 60_000;
const askedAt = new Map();

const canAct = (api, chat, msgId) =>
  typeof api?.telegramPoll === 'function' && Boolean(chat) && msgId > 0;

const useResultsRefresh = (media, { api, chat, msgId }) => {
  const live = canAct(api, chat, msgId) && !media.closed;
  useEffect(() => {
    if (!live) {
      return undefined;
    }
    const key = `${chat}:${msgId}`;
    const ask = () => {
      const hidden = globalThis.document?.visibilityState === 'hidden';
      if (hidden || Date.now() - (askedAt.get(key) ?? 0) < POLL_REFRESH_MS) {
        return;
      }
      askedAt.set(key, Date.now());
      api.telegramPoll('poll-results', { chat, id: msgId }).catch(() => {});
    };
    ask();
    const timer = globalThis.setInterval(ask, POLL_REFRESH_MS);
    return () => globalThis.clearInterval(timer);
  }, [live, api, chat, msgId]);
};

// Seconds left until `closeDate`, ticking while the poll is open.
const useSecondsLeft = (closeDate, closed) => {
  const left = () =>
    closeDate ? Math.max(0, closeDate - Math.floor(Date.now() / 1000)) : 0;
  const [seconds, setSeconds] = useState(left);
  useEffect(() => {
    if (!closeDate || closed) {
      return undefined;
    }
    const timer = globalThis.setInterval(() => setSeconds(left()), 1000);
    return () => globalThis.clearInterval(timer);
  }, [closeDate, closed]);
  return seconds;
};

const clock = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

/** The poll's kind, as its subtitle says it. */
export const pollKindKey = (media) => {
  if (media.closed) {
    return 'chat.poll.final';
  }
  if (media.quiz) {
    return media.publicVoters ? 'chat.poll.quiz' : 'chat.poll.anonymousQuiz';
  }
  return media.publicVoters ? 'chat.poll.public' : 'chat.poll.anonymous';
};

// The poll as it is while our vote is on its way: chosen at once.
const withVote = (media, sending) =>
  sending
    ? {
        ...media,
        voted: sending.length > 0,
        answers: media.answers.map((a) => ({
          ...a,
          chosen: sending.includes(a.option),
        })),
      }
    : media;

const answerClass = (a, poll) => {
  const names = ['poll-answer'];
  if (a.chosen) {
    names.push('chosen');
  }
  if (poll.quiz && a.correct) {
    names.push('correct');
  } else if (poll.quiz && a.chosen) {
    names.push('wrong');
  }
  return names.join(' ');
};

// An answer with its share: Desktop's percent, text, bar and mark.
const ResultRow = ({ a, share, poll }) =>
  el('li', { className: answerClass(a, poll) }, [
    el('span', { key: 'p', className: 'poll-share' }, `${share}%`),
    el('span', { key: 't', className: 'poll-text' }, [
      a.chosen || (poll.quiz && a.correct)
        ? el(
            'span',
            { key: 'm', className: 'poll-mark' },
            el(Icon, {
              name: poll.quiz && !a.correct ? 'close' : 'check',
              size: 12,
            })
          )
        : null,
      el('span', { key: 'x' }, a.text),
    ]),
    el(
      'span',
      { key: 'b', className: 'poll-bar-track' },
      el('span', {
        className: 'poll-bar',
        style: { width: `${Math.max(share, 1)}%` },
      })
    ),
  ]);

// An answer to vote for: a circle, or a box when several may be chosen.
const ChoiceRow = ({ a, multiple, picked, disabled, onPick }) =>
  el(
    'li',
    { className: 'poll-answer' },
    el(
      'button',
      {
        type: 'button',
        className: `poll-choice${picked ? ' picked' : ''}`,
        role: multiple ? 'checkbox' : 'radio',
        'aria-checked': picked ? 'true' : 'false',
        disabled,
        onClick: () => onPick(a.option),
      },
      [
        el('span', {
          key: 'c',
          className: multiple ? 'poll-box' : 'poll-circle',
          'aria-hidden': 'true',
        }),
        el('span', { key: 't', className: 'poll-text' }, a.text),
      ]
    )
  );

const PollHead = ({ poll, api, chat, onSolution }) => {
  const t = useT();
  const seconds = useSecondsLeft(poll.closeDate, poll.closed);
  return el(React.Fragment, null, [
    el('strong', { key: 'q', className: 'poll-question' }, poll.question),
    el('div', { key: 'k', className: 'poll-kind meta' }, [
      el('span', { key: 'n' }, t(pollKindKey(poll))),
      poll.publicVoters && poll.recentVoters.length > 0
        ? el(
            'span',
            { key: 'v', className: 'poll-voters' },
            poll.recentVoters.slice(0, 3).map((peer) =>
              el(PeerAvatar, {
                key: peer,
                api,
                source: 'telegram',
                peer,
                chat,
                className: 'poll-voter',
              })
            )
          )
        : null,
      poll.closeDate && !poll.closed
        ? el('span', { key: 'c', className: 'poll-clock' }, clock(seconds))
        : null,
      poll.quiz && poll.solution && showsResults(poll)
        ? el(
            'button',
            {
              key: 's',
              type: 'button',
              className: 'poll-solution-toggle',
              'aria-label': t('chat.poll.solution'),
              title: t('chat.poll.solution'),
              onClick: onSolution,
            },
            el(Icon, { name: 'bulb', size: 16 })
          )
        : null,
    ]),
  ]);
};

const PollFoot = ({ poll, multiple, picked, busy, onVote, onResults }) => {
  const t = useT();
  if (multiple && !showsResults(poll) && !poll.closed) {
    return el(
      'button',
      {
        type: 'button',
        className: 'poll-action',
        disabled: picked.length === 0 || busy,
        onClick: () => onVote(picked),
      },
      t('chat.poll.vote')
    );
  }
  if (poll.publicVoters && showsResults(poll) && onResults) {
    return el(
      'button',
      { type: 'button', className: 'poll-action', onClick: onResults },
      t('chat.poll.viewResults')
    );
  }
  const total = poll.total ?? 0;
  const key = poll.quiz ? 'chat.poll.answers' : 'chat.poll.votes';
  return el(
    'span',
    { className: 'poll-total meta' },
    total > 0 ? t(key, { count: total }) : t(`${key}None`)
  );
};

// What a poll's results are now: a change in them is Telegram's word.
const resultsStamp = (media) =>
  JSON.stringify([
    media.closed,
    media.total,
    media.answers.map((a) => [a.voters, a.chosen, a.correct]),
  ]);

const usePollVote = (media, { api, chat, msgId }) => {
  const [sending, setSending] = useState(null);
  // What Telegram says next replaces our guess.
  const stamp = resultsStamp(media);
  useEffect(() => setSending(null), [stamp]);
  const vote = async (options) => {
    if (!canAct(api, chat, msgId)) {
      return;
    }
    setSending(options);
    const answer = await api
      .telegramPoll('poll-vote', { chat, id: msgId, options })
      .catch((error) => ({ error: error.message }));
    if (answer?.error || answer?.ok === false) {
      setSending(null);
    }
  };
  return [withVote(media, sending), vote, sending !== null];
};

/** A poll or a quiz in a message. */
export const Poll = ({ media, api, chat, msgId }) => {
  const [poll, vote, busy] = usePollVote(media, { api, chat, msgId });
  const [picked, setPicked] = useState([]);
  const [solution, setSolution] = useState(false);
  const [results, setResults] = useState(false);
  useResultsRefresh(media, { api, chat, msgId });
  const open = !poll.closed && canAct(api, chat, msgId);
  const multiple = poll.multipleChoice && !poll.quiz;
  const shown = showsResults(poll);
  // A wrong answer to a quiz shows why at once.
  const wrong = poll.quiz && poll.answers.some((a) => a.chosen && !a.correct);
  useEffect(() => setSolution(Boolean(wrong && poll.solution)), [wrong]);
  const pick = (option) => {
    if (!multiple) {
      vote([option]);
      return;
    }
    setPicked((now) =>
      now.includes(option) ? now.filter((o) => o !== option) : [...now, option]
    );
  };
  const shares = nicePercents(
    poll.answers.map((a) => a.voters ?? 0),
    poll.total ?? 0
  );
  return el('div', { className: `bubble-poll${shown ? ' results' : ''}` }, [
    el(PollHead, {
      key: 'h',
      poll,
      api,
      chat,
      onSolution: () => setSolution((s) => !s),
    }),
    solution && poll.solution
      ? el('p', { key: 'why', className: 'poll-solution' }, poll.solution)
      : null,
    el(
      'ul',
      { key: 'a', className: 'poll-answers' },
      poll.answers.map((a, i) =>
        shown
          ? el(ResultRow, { key: i, a, share: shares[i], poll })
          : el(ChoiceRow, {
              key: i,
              a,
              multiple,
              picked: picked.includes(a.option),
              disabled: !open || busy || !a.option,
              onPick: pick,
            })
      )
    ),
    el(PollFoot, {
      key: 'f',
      poll,
      multiple,
      picked,
      busy,
      onVote: vote,
      onResults: canAct(api, chat, msgId) ? () => setResults(true) : null,
    }),
    results
      ? el(PollVotersDialog, {
          key: 'd',
          poll,
          api,
          chat,
          msgId,
          onClose: () => setResults(false),
        })
      : null,
  ]);
};

// One answer's voters, a page at a time.
const useVoters = ({ api, chat, msgId, option }) => {
  const [state, setState] = useState({ votes: [], next: '', count: null });
  const more = async () => {
    const answer = await api
      .telegramPoll('poll-votes', {
        chat,
        id: msgId,
        option,
        ...(state.next ? { offset: state.next } : {}),
        limit: 50,
      })
      .catch(() => null);
    if (answer?.ok) {
      setState((now) => ({
        votes: [...now.votes, ...answer.votes],
        next: answer.nextOffset ?? null,
        count: answer.count,
      }));
    } else {
      setState((now) => ({ ...now, next: null }));
    }
  };
  useEffect(() => {
    more();
  }, []);
  return [state, more];
};

const VoterGroup = ({ answer, share, api, chat, msgId }) => {
  const t = useT();
  const [state, more] = useVoters({ api, chat, msgId, option: answer.option });
  return el('section', { className: 'poll-voters-group' }, [
    el('h4', { key: 'h' }, [
      el('span', { key: 't' }, answer.text),
      el(
        'span',
        { key: 'n', className: 'meta' },
        `${share}% · ${t('chat.poll.votes', { count: answer.voters ?? 0 })}`
      ),
    ]),
    el(
      'ul',
      { key: 'l' },
      state.votes.map((v) =>
        el('li', { key: v.peer }, [
          el(PeerAvatar, {
            key: 'a',
            api,
            source: 'telegram',
            peer: v.peer,
            name: v.name,
            chat,
          }),
          el('span', { key: 'n' }, v.name ?? v.peer),
        ])
      )
    ),
    state.next
      ? el(
          'button',
          { key: 'm', type: 'button', className: 'link', onClick: more },
          t('chat.poll.showMore')
        )
      : null,
  ]);
};

/** View results: who voted for what, by answer (public polls). */
export const PollVotersDialog = ({ poll, api, chat, msgId, onClose }) => {
  const t = useT();
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    globalThis.addEventListener?.('keydown', onKey);
    return () => globalThis.removeEventListener?.('keydown', onKey);
  }, [onClose]);
  const shares = nicePercents(
    poll.answers.map((a) => a.voters ?? 0),
    poll.total ?? 0
  );
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      onClick: (e) => e.target === e.currentTarget && onClose(),
    },
    el('div', { className: 'delete-dialog poll-voters-dialog' }, [
      el(
        'h3',
        { key: 'h' },
        t(poll.quiz ? 'chat.poll.quiz' : 'chat.poll.results')
      ),
      el('p', { key: 'q', className: 'poll-question' }, poll.question),
      el(
        'div',
        { key: 'g', className: 'poll-voters-list' },
        poll.answers
          .map((a, i) => [a, i])
          .filter(([a]) => (a.voters ?? 0) > 0 && a.option)
          .map(([a, i]) =>
            el(VoterGroup, {
              key: i,
              answer: a,
              share: shares[i],
              api,
              chat,
              msgId,
            })
          )
      ),
      el(
        'div',
        { key: 'b', className: 'delete-dialog-btns' },
        el('button', { type: 'button', onClick: onClose }, t('chat.poll.close'))
      ),
    ])
  );
};

/** Stop poll?, as Desktop asks it: nobody can vote after. */
export const StopPollDialog = ({ onClose, onStop }) => {
  const t = useT();
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    globalThis.addEventListener?.('keydown', onKey);
    return () => globalThis.removeEventListener?.('keydown', onKey);
  }, [onClose]);
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
    },
    el('div', { className: 'delete-dialog' }, [
      el('h3', { key: 'h' }, t('chat.poll.stopTitle')),
      el('p', { key: 'q' }, t('chat.poll.stopWarning')),
      el('div', { key: 'b', className: 'delete-dialog-btns' }, [
        el(
          'button',
          {
            key: 's',
            type: 'button',
            className: 'danger',
            autoFocus: true,
            onClick: () => {
              onClose();
              onStop();
            },
          },
          t('chat.poll.stopConfirm')
        ),
        el(
          'button',
          { key: 'c', type: 'button', onClick: onClose },
          t('common.cancel')
        ),
      ]),
    ])
  );
};

/** A checklist: a box per task, ticked by whoever did it. */
export const Checklist = ({ media, api, chat, msgId, mine = false }) => {
  const t = useT();
  const [pending, setPending] = useState({});
  const stamp = JSON.stringify(media.items.map((i) => [i.id, i.done]));
  useEffect(() => setPending({}), [stamp]);
  const may = canAct(api, chat, msgId) && (mine || media.othersCanComplete);
  const toggle = async (item) => {
    const done = !(pending[item.id] ?? item.done);
    setPending((now) => ({ ...now, [item.id]: done }));
    const answer = await api
      .telegramPoll('todo-toggle', {
        chat,
        id: msgId,
        ...(done ? { completed: [item.id] } : { incompleted: [item.id] }),
      })
      .catch(() => null);
    if (!answer?.ok) {
      setPending((now) => ({ ...now, [item.id]: undefined }));
    }
  };
  const doneCount = media.items.filter((i) => pending[i.id] ?? i.done).length;
  return el('div', { className: 'bubble-poll bubble-todo' }, [
    el('strong', { key: 'q', className: 'poll-question' }, media.title),
    el('span', { key: 'k', className: 'poll-kind meta' }, t('chat.todo.kind')),
    el(
      'ul',
      { key: 'l', className: 'poll-answers' },
      media.items.map((item) => {
        const done = pending[item.id] ?? item.done;
        return el(
          'li',
          { key: item.id, className: `poll-answer${done ? ' chosen' : ''}` },
          el(
            'button',
            {
              type: 'button',
              className: `poll-choice${done ? ' picked' : ''}`,
              role: 'checkbox',
              'aria-checked': done ? 'true' : 'false',
              disabled: !may,
              onClick: () => toggle(item),
            },
            [
              el('span', {
                key: 'c',
                className: 'poll-box',
                'aria-hidden': 'true',
              }),
              el('span', { key: 't', className: 'poll-text' }, item.text),
            ]
          )
        );
      })
    ),
    el(
      'span',
      { key: 'f', className: 'poll-total meta' },
      t('chat.todo.done', { done: doneCount, count: media.items.length })
    ),
  ]);
};
