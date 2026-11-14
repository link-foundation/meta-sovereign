import React from 'react';
const el = React.createElement;

export const ApplicationLetterSettings = ({ options, setOptions, t }) => {
  const standard = Boolean(options.standardLetters);
  return el('div', { className: 'col' }, [
    el('label', { key: 'mode', className: 'row' }, [
      el('input', {
        key: 'input',
        type: 'checkbox',
        checked: standard,
        'data-application-option': 'standardLetters',
        onChange: (event) =>
          setOptions({
            ...options,
            coverLetter: '',
            standardLetters: event.target.checked
              ? { en: '', ru: '' }
              : undefined,
          }),
      }),
      el('span', { key: 'label' }, t('application.standardLetters')),
    ]),
    ...(standard ? ['en', 'ru'] : ['custom']).map((language) =>
      el('label', { key: language, className: 'col' }, [
        t(
          language === 'custom'
            ? 'application.coverLetter'
            : `application.standardLetter.${language}`
        ),
        el('textarea', {
          key: 'input',
          rows: 4,
          maxLength: 24000,
          ...(standard
            ? { 'data-application-standard-letter': language }
            : { 'data-application-letter': true }),
          value: standard
            ? options.standardLetters[language]
            : options.coverLetter,
          onChange: (event) =>
            setOptions(
              standard
                ? {
                    ...options,
                    standardLetters: {
                      ...options.standardLetters,
                      [language]: event.target.value,
                    },
                  }
                : { ...options, coverLetter: event.target.value }
            ),
        }),
      ])
    ),
    standard
      ? el(
          'p',
          { key: 'hint', className: 'meta' },
          t('application.standardLettersHint')
        )
      : null,
  ]);
};
