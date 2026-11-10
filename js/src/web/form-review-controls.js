import React, { useEffect, useState, useRef } from 'react';
import { useT } from './i18n.js';

const el = React.createElement;
const errorKey = (code) =>
  [
    'form-slot-in-use',
    'form-session-limit',
    'form-session-missing',
    'form-session-closed',
    'form-close-failed',
    'form-focus-unavailable',
    'form-busy',
    'form-timeout',
    'form-stopped',
    'server-required',
  ].includes(code)
    ? code
    : 'form-review-failed';
const validList = (value) => value?.ok && Array.isArray(value.sessions);

const useReviewControls = ({ api, setBusy, onReport }) => {
  const [listing, setListing] = useState(null);
  const [error, setError] = useState(null);
  const [operation, setOperation] = useState(null);
  const [probe, setProbe] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    let current = true;
    const ticket = ++generation.current;
    Promise.resolve()
      .then(() => api.formsReviews())
      .then(
        (value) => {
          if (current && ticket === generation.current) {
            if (validList(value)) {
              setListing(value);
              setError(null);
            } else {
              setError(value?.code ?? 'form-review-failed');
            }
          }
        },
        () => {
          if (current && ticket === generation.current) {
            setError('form-review-failed');
          }
        }
      );
    return () => {
      current = false;
    };
  }, [api, probe]);
  const run = async (action, body) => {
    ++generation.current;
    setBusy(true);
    setOperation(action);
    setError(null);
    try {
      const result = await api[`forms${action}Review`](body);
      if (!result?.ok) {
        setError(result?.code ?? 'form-review-failed');
      } else if (['Read', 'History'].includes(action)) {
        onReport(result);
      }
      const value = await api.formsReviews();
      if (validList(value)) {
        setListing(value);
      } else {
        setError(value?.code ?? 'form-review-failed');
      }
    } catch (failure) {
      setError(failure.code ?? 'form-review-failed');
    } finally {
      setBusy(false);
      setOperation(null);
    }
  };
  return {
    listing,
    error,
    operation,
    run,
    refresh: () => setProbe((n) => n + 1),
  };
};

const ReviewCard = ({ session, busy, run }) => {
  const t = useT();
  const closed = session.state !== 'open';
  return el(
    'article',
    { className: 'card col', 'data-form-review': session.id },
    [
      el('h3', { key: 'slot' }, session.browserSlot),
      el(
        'p',
        { key: 'url', className: 'meta', style: { overflowWrap: 'anywhere' } },
        session.url
      ),
      el(
        'p',
        { key: 'state', role: 'status' },
        t(`forms.review.state.${session.state}`)
      ),
      el(
        'p',
        { key: 'visibility', className: 'meta' },
        t(
          session.headless === true
            ? 'forms.review.headless'
            : session.headless === false
              ? 'forms.review.headed'
              : 'forms.review.visibilityPending'
        )
      ),
      el(
        'p',
        { key: 'expiry', className: 'meta' },
        t('forms.review.expires', { time: session.idleExpiresAt })
      ),
      ...['Read', 'History', 'Focus', 'Close'].map((action) =>
        el(
          'button',
          {
            key: action,
            type: 'button',
            'data-review-action': action.toLowerCase(),
            disabled:
              busy ||
              session.busy ||
              (action !== 'Close' && closed) ||
              (action === 'Focus' && session.headless === true),
            onClick: () => run(action, { id: session.id }),
          },
          t(`forms.review.${action.toLowerCase()}`)
        )
      ),
    ]
  );
};

export const FormReviewControls = (props) => {
  const { url, slot, busy, available } = props;
  const t = useT();
  const controls = useReviewControls(props);
  return el('section', { className: 'card col', 'data-form-reviews': '' }, [
    el('h2', { key: 'title' }, t('forms.review.title')),
    el('p', { key: 'hint', className: 'meta' }, t('forms.review.hint')),
    el(
      'button',
      {
        key: 'open',
        type: 'button',
        disabled: busy || !available || !url || !controls.listing,
        'data-action': 'open-form-review',
        'aria-busy': controls.operation === 'Open',
        onClick: () => controls.run('Open', { url, browserSlot: slot }),
      },
      t(
        controls.operation === 'Open'
          ? 'forms.review.opening'
          : 'forms.review.open'
      )
    ),
    el(
      'button',
      {
        key: 'refresh',
        type: 'button',
        disabled: busy,
        'data-action': 'refresh-form-reviews',
        onClick: controls.refresh,
      },
      t('forms.review.refresh')
    ),
    controls.listing
      ? el(
          'p',
          { key: 'count', className: 'meta' },
          t('forms.review.count', {
            count: controls.listing.sessions.length,
            limit: controls.listing.maxSessions,
          })
        )
      : controls.error
        ? null
        : el(
            'p',
            { key: 'loading', role: 'status' },
            t('forms.review.loading')
          ),
    controls.error
      ? el(
          'p',
          {
            key: 'error',
            role: 'alert',
            'data-form-review-error': controls.error,
          },
          t(`forms.review.error.${errorKey(controls.error)}`)
        )
      : null,
    ...(controls.listing?.sessions ?? []).map((session) =>
      el(ReviewCard, { key: session.id, session, busy, run: controls.run })
    ),
  ]);
};
