import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import { Busy } from './spinner.js';
import { useFeedbackRead } from './feedback-read.js';
import {
  feedbackDirectTarget,
  openFeedbackPerson,
  feedbackEmoji,
} from './feedback-navigation.js';
import { PersonReactions } from './person-reactions.js';

const el = React.createElement;
const nameOf = (actor, t) =>
  actor.name && actor.name !== actor.id
    ? actor.name
    : actor.username
      ? `@${actor.username}`
      : t('feedback.unknownPerson');

export const FeedbackActorProfile = ({ actor, source, api, close }) => {
  const t = useT();
  return el(
    Frame,
    { title: nameOf(actor, t), name: 'feedback-person', close },
    [
      el(
        'p',
        { key: 'id', className: 'meta' },
        t('feedback.userId', {
          source,
          id: actor.id ?? t('feedback.notProvided'),
        })
      ),
      actor.username ? el('p', { key: 'handle' }, `@${actor.username}`) : null,
      actor.deletedAccount
        ? el(
            'p',
            { key: 'deleted', className: 'meta' },
            t('chat.account.deleted')
          )
        : null,
      feedbackDirectTarget(source, actor)
        ? el(
            'button',
            {
              key: 'message',
              type: 'button',
              'data-action': 'feedback-message-person',
              onClick: () => openFeedbackPerson(source, actor),
            },
            t('feedback.messagePerson')
          )
        : null,
      el(PersonReactions, { key: 'facts', api, source, peer: actor.id }),
    ]
  );
};

const AuthorRows = ({ actors, source, setProfile }) => {
  const t = useT();
  return el(
    'div',
    { className: 'feedback-people' },
    actors.map((actor, n) =>
      el(
        'div',
        {
          key: `${actor.kind}:${actor.id}:${actor.emoji}:${n}`,
          className: 'feedback-person',
          'data-feedback-peer': actor.id ?? '',
        },
        [
          el(
            'span',
            { key: 'emoji', className: 'feedback-emoji' },
            feedbackEmoji(actor.emoji)
          ),
          el(
            'button',
            {
              key: 'profile',
              type: 'button',
              className: 'ghost feedback-person-name',
              'data-action': 'feedback-profile',
              onClick: () => setProfile(actor),
            },
            nameOf(actor, t)
          ),
          feedbackDirectTarget(source, actor)
            ? el(
                'button',
                {
                  key: 'message',
                  type: 'button',
                  className: 'ghost',
                  'data-action': 'feedback-message-person',
                  onClick: () => openFeedbackPerson(source, actor),
                },
                t('feedback.messagePerson')
              )
            : null,
        ]
      )
    )
  );
};

const AuthorStatus = ({ data, loading, error }) => {
  const t = useT();
  return [
    loading ? el(Busy, { key: 'busy' }, t('common.loading')) : null,
    data
      ? el(
          'p',
          { key: 'summary', className: 'meta' },
          t('feedback.authors.summary', {
            known: data.cachedTotal,
            total: data.total,
          })
        )
      : null,
    data?.status === 'hidden'
      ? el(
          'p',
          { key: 'hidden', className: 'meta' },
          t('feedback.authors.hidden')
        )
      : null,
    data && !data.liveSupported && data.status !== 'hidden'
      ? el(
          'p',
          { key: 'cached', className: 'meta' },
          t('feedback.authors.observedOnly')
        )
      : null,
    error
      ? el(
          'p',
          { key: 'error', role: 'status', className: 'meta' },
          t(`feedback.error.${error === 'busy' ? 'busy' : 'unavailable'}`)
        )
      : null,
  ];
};

export const FeedbackAuthors = ({ api, message, close }) => {
  const t = useT();
  const [offset, setOffset] = useState(0);
  const [collecting, setCollecting] = useState(false);
  const [error, setError] = useState(null);
  const [profile, setProfile] = useState(null);
  const requested = useRef(new Set());
  const read = useFeedbackRead(
    () => api.feedbackActors(message.id, { offset, limit: 50 }),
    `authors:${message.id}:${offset}`
  );
  const data = read.data;
  useEffect(() => {
    setOffset(0);
  }, [message.id]);
  const collect = async () => {
    setCollecting(true);
    setError(null);
    try {
      const result = await api.collectFeedback(
        message.id,
        data?.complete ? '' : (data?.next ?? undefined)
      );
      if (!result?.ok || result.status === 'error') {
        setError(result?.code ?? 'unavailable');
      }
      await read.refresh();
    } catch {
      setError('unavailable');
    } finally {
      setCollecting(false);
    }
  };
  useEffect(() => {
    if (
      data?.liveSupported &&
      !data.complete &&
      !requested.current.has(message.id)
    ) {
      requested.current.add(message.id);
      collect();
    }
  }, [message.id, data?.liveSupported, data?.complete]);
  if (profile) {
    return el(FeedbackActorProfile, {
      api,
      actor: profile,
      source: message.source,
      close: () => setProfile(null),
    });
  }
  return el(
    Frame,
    { title: t('feedback.authors.title'), name: 'feedback-authors', close },
    [
      el(AuthorStatus, { key: 'status', data, loading: read.loading, error }),
      data?.liveSupported
        ? el(
            'button',
            {
              key: 'collect',
              type: 'button',
              'data-action': 'feedback-collect',
              disabled: collecting,
              onClick: collect,
            },
            collecting
              ? t('feedback.collecting')
              : data.next
                ? t('feedback.authors.collectMore')
                : t('feedback.authors.refresh')
          )
        : null,
      el(AuthorRows, {
        key: 'people',
        actors: data?.actors ?? [],
        source: message.source,
        setProfile,
      }),
      data && (offset || data.cachedNext !== null)
        ? el('div', { key: 'pages', className: 'row' }, [
            el(
              'button',
              {
                key: 'prev',
                type: 'button',
                disabled: offset === 0,
                onClick: () => setOffset(Math.max(0, offset - 50)),
              },
              t('feedback.previous')
            ),
            el(
              'button',
              {
                key: 'next',
                type: 'button',
                disabled: data.cachedNext === null,
                onClick: () => setOffset(data.cachedNext),
              },
              t('feedback.next')
            ),
          ])
        : null,
    ]
  );
};
