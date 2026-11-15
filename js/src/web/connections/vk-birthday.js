import React from 'react';
import { api } from '../dom.js';
import { useT } from '../i18n.js';
import { VkFriendPolicy } from './vk-friends.js';
import { SequenceEvidence } from './vk-reengage.js';
import {
  birthdayFields,
  birthdayTextFields,
} from '../../automation/vk-birthday-settings.js';
const el = React.createElement;
const BirthdayEvidence = ({ item }) => {
  const t = useT();
  return el('div', { className: 'col' }, [
    el(
      'p',
      { key: 'date', className: 'meta', 'data-birthday-date': '' },
      t('vkBirthday.selectedDate', { date: item.cycle ?? '—' })
    ),
    el(SequenceEvidence, { key: 'steps', item }),
  ]);
};
export const VkBirthday = () =>
  el(VkFriendPolicy, {
    name: 'birthday',
    prefix: 'vkBirthday',
    fields: birthdayFields,
    textFields: birthdayTextFields,
    booleanFields: ['onlineOnly'],
    evidence: BirthdayEvidence,
    resource: {
      load: api.vkBirthday,
      save: api.saveVkBirthday,
      plan: api.planVkBirthday,
      run: api.runVkBirthday,
    },
  });
