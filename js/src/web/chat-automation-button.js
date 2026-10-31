import React from 'react';
import { useT } from './i18n.js';
import { Spinner } from './spinner.js';

const el = React.createElement;

export const AutomationRunButton = ({
  menu,
  automation,
  test,
  find = false,
}) => {
  const t = useT();
  const active =
    menu.running?.id === automation.id &&
    (find
      ? menu.running.kind === 'find'
      : !menu.running.kind && menu.running.test === test);
  return el(
    'button',
    {
      type: 'button',
      role: 'menuitem',
      'data-action': find
        ? 'chat-automation-find'
        : test
          ? 'chat-automation-test'
          : 'chat-automation-run',
      'data-automation': automation.id,
      'aria-busy': active,
      disabled: Boolean(menu.running),
      title: find ? t('chat.automation.findHint') : undefined,
      onClick: () =>
        find ? menu.find(automation) : menu.run(automation, { test }),
    },
    [
      active ? el(Spinner, { key: 'busy' }) : null,
      el(
        'span',
        { key: 'label' },
        t(
          find
            ? active
              ? 'chat.automation.finding'
              : 'chat.automation.find'
            : active
              ? 'chat.automation.running'
              : test
                ? 'chat.automation.test'
                : 'chat.automation.run'
        )
      ),
    ]
  );
};
