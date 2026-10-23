// Settings → Interface scale and message text size (R-Y192; learned,
// never copied): the scale as Telegram Desktop's steps, a slider for the
// size of a message's text, and an opt-in switch for Ctrl/Cmd + = / − / 0
// (the browser's own zoom keys, so it is off). See ./ui-scale.js.

import React from 'react';
import { useT } from './i18n.js';
import { SCALES, TEXT_SIZE, setUiScale, useUiScale } from './ui-scale.js';

const el = React.createElement;

export const ScaleSettings = () => {
  const t = useT();
  const settings = useUiScale();
  const size = settings.textSize ?? TEXT_SIZE.normal;
  return el(
    'section',
    { className: 'card scale-settings', 'aria-labelledby': 'scale-title' },
    [
      el('h3', { key: 'h', id: 'scale-title' }, t('settings.scale.title')),
      el('p', { key: 'i', className: 'meta' }, t('settings.scale.intro')),
      el('label', { key: 'scale', className: 'media-limit' }, [
        el('span', { key: 'l' }, t('settings.scale.label')),
        el(
          'select',
          {
            key: 's',
            'data-action': 'ui-scale',
            value: String(settings.scale),
            onChange: (event) => {
              const value = event.target.value;
              setUiScale({ scale: value === 'auto' ? 'auto' : Number(value) });
            },
          },
          SCALES.map((scale) =>
            el(
              'option',
              { key: scale, value: String(scale) },
              scale === 'auto' ? t('settings.scale.auto') : `${scale}%`
            )
          )
        ),
      ]),
      el('label', { key: 'text', className: 'media-limit' }, [
        el('span', { key: 'l' }, `${t('settings.scale.textSize')}: ${size}`),
        el('input', {
          key: 'r',
          type: 'range',
          min: TEXT_SIZE.min,
          max: TEXT_SIZE.max,
          step: 1,
          value: size,
          'data-action': 'text-size',
          onChange: (event) =>
            setUiScale({ textSize: Number(event.target.value) }),
        }),
        el(
          'button',
          {
            key: 'd',
            type: 'button',
            'data-action': 'text-size-default',
            disabled: settings.textSize === null,
            onClick: () => setUiScale({ textSize: null }),
          },
          t('settings.scale.textDefault')
        ),
      ]),
      el('label', { key: 'keys', className: 'check' }, [
        el('input', {
          key: 'i',
          type: 'checkbox',
          checked: settings.keys,
          'data-action': 'scale-keys',
          onChange: (event) => setUiScale({ keys: event.target.checked }),
        }),
        ` ${t('settings.scale.keys')}`,
      ]),
      el('p', { key: 'n', className: 'meta' }, t('settings.scale.keysNote')),
    ]
  );
};
