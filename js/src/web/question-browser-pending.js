import React from 'react';
import { useT } from './i18n.js';

const el = React.createElement;
const scopeKey = (snapshot, plan) => {
  if (!snapshot.strictOptions && plan?.pending) {
    return 'browserAnswer.wholeTurn';
  }
  return snapshot.strictOptions && plan?.pending?.blocked === false
    ? 'browserAnswer.latestAfterCompleted'
    : 'browserAnswer.latestOnly';
};

/** Shared reviewed context for Questions, Chat, Operator and the finite watcher. */
export const BrowserPendingTurn = ({
  snapshot,
  plan,
  historyVerified = false,
}) => {
  const t = useT();
  const turn = snapshot.pendingTurn;
  const messages = turn?.messages.length ? turn.messages : [snapshot.question];
  return el(
    'section',
    { className: 'col', 'data-browser-pending-turn': true },
    [
      turn?.messages.length
        ? el(
            'strong',
            { key: 'title', className: 'field-label' },
            t('browserAnswer.turn', { count: turn.messages.length })
          )
        : null,
      el(
        'ol',
        { key: 'messages', className: 'col' },
        messages.map((message) =>
          el('li', { key: message.id, className: 'wrap' }, message.body)
        )
      ),
      el(
        'small',
        { key: 'coverage', className: 'meta' },
        t(
          historyVerified
            ? 'noticePolicy.historyVerified'
            : `browserAnswer.boundary.${turn?.boundary.kind ?? 'unknown'}`
        )
      ),
      turn?.messages.length > 1
        ? el(
            'p',
            { key: 'scope', className: 'meta' },
            t(scopeKey(snapshot, plan))
          )
        : null,
    ]
  );
};
