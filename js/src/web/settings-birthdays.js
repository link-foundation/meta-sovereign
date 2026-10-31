import React from 'react';
import { useT } from './i18n.js';
import { Check } from './settings-fields.js';
import {
  useBirthdayTomorrow,
  useBirthdayHideGreeted,
} from './birthday-prefs.js';

const el = React.createElement;

export const BirthdaySettings = () => {
  const t = useT();
  const [tomorrow, setTomorrow] = useBirthdayTomorrow();
  const [hideGreeted, setHideGreeted] = useBirthdayHideGreeted();
  return el('section', { className: 'card birthday-settings' }, [
    el('h3', { key: 'h' }, t('settings.birthdays.title')),
    el(Check, {
      key: 'tomorrow',
      action: 'birthdays-tomorrow',
      checked: tomorrow,
      onChange: setTomorrow,
      label: t('settings.birthdays.tomorrow'),
    }),
    el(Check, {
      key: 'greeted',
      action: 'birthdays-hide-greeted',
      checked: hideGreeted,
      onChange: setHideGreeted,
      label: t('settings.birthdays.hideGreeted'),
    }),
    el('p', { key: 'hint', className: 'meta' }, t('settings.birthdays.hint')),
  ]);
};
