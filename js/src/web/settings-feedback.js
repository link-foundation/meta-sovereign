import React, { useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Check } from './settings-fields.js';
import { useFeedbackRead } from './feedback-read.js';

const el = React.createElement;
export const FeedbackSettings = ({ api }) => {
  const t = useT();
  const read = useFeedbackRead(
    () => api.feedbackSettings(),
    'feedback-settings'
  );
  const [edited, setEdited] = useState(null);
  const [error, setError] = useState(false);
  const saves = useRef(Promise.resolve());
  const settings = edited ?? read.data ?? { enabled: true, profiles: true };
  const set = (key, on) => {
    const next = { ...settings, [key]: on };
    setEdited(next);
    setError(false);
    saves.current = saves.current
      .then(() => api.saveFeedbackSettings(next))
      .then(
        (answer) => {
          if (answer?.error) {
            setError(true);
          }
        },
        () => setError(true)
      );
  };
  return el('section', { className: 'card feedback-settings' }, [
    el('h3', { key: 'h' }, t('feedback.settings.title')),
    ...['enabled', 'profiles'].map((key) =>
      el(Check, {
        key,
        action: `feedback-${key}`,
        checked: settings[key],
        disabled: read.loading,
        onChange: (on) => set(key, on),
        label: t(`feedback.settings.${key}`),
      })
    ),
    el('p', { key: 'hint', className: 'meta' }, t('feedback.settings.hint')),
    error
      ? el('p', { key: 'error', role: 'status' }, t('feedback.settings.failed'))
      : null,
  ]);
};
