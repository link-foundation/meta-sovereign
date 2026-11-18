import React from 'react';
import { useT } from './i18n.js';
import { ProfileImport } from './question-profile-import.js';
import { ProfileValues } from './question-profile-values.js';
import { SharedProfile } from './question-shared-profile.js';

const el = React.createElement;
export const ProfileFields = ({
  profile = {},
  set,
  profileId = '',
  setProfileId,
  api,
  disabled = false,
}) => {
  const t = useT();
  return el('div', { className: 'col', 'data-answer-profile': true }, [
    el('strong', { key: 'h' }, t('questions.profile')),
    api?.answerProfiles && setProfileId
      ? el(SharedProfile, {
          key: 'shared',
          api,
          profileId,
          setProfileId,
          disabled,
        })
      : null,
    api?.extractAnswerProfile
      ? el(ProfileImport, { key: 'import', api, profile, set, disabled })
      : null,
    profileId
      ? el(
          'p',
          { key: 'overrides', className: 'meta' },
          t('questions.sharedOverrides')
        )
      : null,
    el(ProfileValues, { key: 'values', profile, set }),
  ]);
};
