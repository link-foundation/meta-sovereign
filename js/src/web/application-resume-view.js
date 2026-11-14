import React from 'react';
const el = React.createElement;

export const ApplicationResumeView = ({ receipt, action, writable, t }) => {
  const chooser = receipt?.page?.resumeChooser;
  if (!chooser) {
    return null;
  }
  return el('fieldset', { className: 'automation-fieldset' }, [
    el('legend', { key: 'title' }, t('application.resume')),
    el(
      'p',
      { key: 'current', 'data-application-resume-title': true },
      chooser.title
    ),
    el('p', { key: 'hint', className: 'meta' }, t('application.resumeHint')),
    chooser.ambiguous
      ? el(
          'p',
          { key: 'unsupported', role: 'note' },
          t('application.resumeUnavailable')
        )
      : null,
    el(
      'button',
      {
        key: 'menu',
        type: 'button',
        'data-application-action': 'resume-menu',
        disabled: !writable || chooser.ambiguous || chooser.disabled,
        onClick: action('Resume', { action: 'menu', confirm: true }),
      },
      t(chooser.open ? 'application.resumeClose' : 'application.resumeOpen')
    ),
    ...chooser.options.map((row, index) =>
      el(
        'button',
        {
          key: `${row.hash}:${index}`,
          type: 'button',
          'data-application-resume': row.hash,
          style: {
            whiteSpace: 'normal',
            overflowWrap: 'anywhere',
            maxWidth: '100%',
          },
          disabled:
            !writable || chooser.ambiguous || chooser.disabled || row.disabled,
          onClick: action('Resume', {
            action: 'choose',
            resume: row.hash,
            confirm: true,
          }),
        },
        t('application.resumeChoose', { title: row.title, hash: row.hash })
      )
    ),
    receipt.resumeSelection
      ? el(
          'p',
          {
            key: 'proof',
            role: 'status',
            'data-application-resume-proof':
              receipt.resumeSelection.languageProof.language,
          },
          t('application.resumeVerified', {
            hash: receipt.resumeSelection.hash,
            language:
              receipt.resumeSelection.languageProof.language.toUpperCase(),
          })
        )
      : null,
  ]);
};
