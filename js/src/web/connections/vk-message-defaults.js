import React, { useState } from 'react';
import { useT } from '../i18n.js';

/** Reset only the visible draft; saved owner text changes only after Save. */
export const VkMessageDefaults = ({
  name,
  defaults,
  settings,
  draft,
  replace,
  disabled,
}) => {
  const t = useT();
  const [previous, setPrevious] = useState(null);
  const reset = () => {
    setPrevious(
      Object.fromEntries(
        Object.keys(defaults).map((key) => [key, draft[key] ?? settings[key]])
      )
    );
    replace(defaults);
  };
  const undo = () => {
    replace(previous);
    setPrevious(null);
  };
  return React.createElement('div', { className: 'col' }, [
    React.createElement(
      'p',
      { key: 'hint', className: 'meta' },
      t('vkMessageDefaults.hint')
    ),
    React.createElement('div', { key: 'actions', className: 'row' }, [
      React.createElement(
        'button',
        {
          key: 'reset',
          type: 'button',
          disabled,
          'data-action': `vk-${name}-message-defaults`,
          onClick: reset,
        },
        t(`vkMessageDefaults.${name}`)
      ),
      previous
        ? React.createElement(
            'button',
            {
              key: 'undo',
              type: 'button',
              disabled,
              'data-action': `vk-${name}-message-undo`,
              onClick: undo,
            },
            t('vkMessageDefaults.undo')
          )
        : null,
    ]),
  ]);
};
