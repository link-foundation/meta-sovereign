import React from 'react';
import { useT } from '../i18n.js';

export const friendPriorityActions = (resource, data, edit) =>
  resource.seedPriority
    ? {
        canRun: data.canRun,
        seed: () => edit(resource.seedPriority),
        clear: () => edit(resource.clearPriority),
      }
    : null;

export const VkFriendPriorityActions = ({ disabled, canRun, seed, clear }) => {
  const t = useT();
  return React.createElement(
    'div',
    { className: 'row' },
    [
      ['seed', seed],
      ['clear', clear],
    ].map(([name, onClick]) =>
      React.createElement(
        'button',
        {
          key: name,
          type: 'button',
          disabled: disabled || !canRun,
          'data-action': `vk-friends-${name}-priority`,
          onClick,
        },
        t(`vkFriends.${name}Priority`)
      )
    )
  );
};
