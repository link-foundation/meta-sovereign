import React from 'react';
import { useT } from './i18n.js';
import { Check } from './settings-fields.js';
import { useConversationSettings } from './conversation-prefs.js';
const el = React.createElement;

export const ConversationSettings = ({ api }) => {
  const t = useT();
  const { settings, set, error } = useConversationSettings(api);
  return el('section', { className: 'card conversation-settings' }, [
    el('h3', { key: 'title' }, t('settings.conversation.title')),
    el(
      'p',
      { key: 'hint', className: 'meta' },
      t('settings.conversation.hint')
    ),
    ...Object.entries(settings).map(([key, enabled]) =>
      el(Check, {
        key,
        action: `conversation-${key}`,
        checked: enabled,
        disabled: key !== 'enabled' && !settings.enabled,
        onChange: (on) => set(key, on),
        label: t(`settings.conversation.${key}`),
      })
    ),
    error
      ? el(
          'p',
          { key: 'error', role: 'status', className: 'meta' },
          t('settings.conversation.saveFailed')
        )
      : null,
  ]);
};
