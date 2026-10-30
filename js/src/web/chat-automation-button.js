import React from 'react';
import { useT } from './i18n.js';
import { Spinner } from './spinner.js';

const el = React.createElement;

export const AutomationRunButton = ({ menu, automation, test }) => {
  const t = useT();
  const active =
    menu.running?.id === automation.id && menu.running.test === test;
  return el(
    'button',
    {
      type: 'button',
      role: 'menuitem',
      'data-action': test ? 'chat-automation-test' : 'chat-automation-run',
      'data-automation': automation.id,
      'aria-busy': active,
      disabled: Boolean(menu.running),
      onClick: () => menu.run(automation, { test }),
    },
    [
      active ? el(Spinner, { key: 'busy' }) : null,
      el(
        'span',
        { key: 'label' },
        t(
          active
            ? 'chat.automation.running'
            : test
              ? 'chat.automation.test'
              : 'chat.automation.run'
        )
      ),
    ]
  );
};
