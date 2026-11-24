import React from 'react';
import { useT } from './i18n.js';

export const FormLearningStatus = ({ learning }) => {
  const t = useT();
  return learning
    ? React.createElement(
        'div',
        { className: 'col', 'data-form-learning': learning.state },
        [
          React.createElement(
            'p',
            { key: 'state', role: 'status' },
            t(`forms.learning.${learning.state}`, learning)
          ),
          learning.last?.reportFile?.state === 'failed'
            ? React.createElement(
                'p',
                { key: 'file', role: 'alert' },
                t('forms.reportFailed')
              )
            : null,
        ]
      )
    : null;
};

export const FormLearningOutcome = ({ learning }) => {
  const t = useT();
  return learning
    ? React.createElement('div', { 'data-form-learned': learning.kind }, [
        React.createElement(
          'p',
          { key: 'result' },
          t('forms.learning.result', {
            ...learning,
            kind: t(`forms.learning.kind.${learning.kind}`),
          })
        ),
        learning.pairs?.length
          ? React.createElement('details', { key: 'pairs' }, [
              React.createElement(
                'summary',
                { key: 'summary' },
                t('forms.learning.observed')
              ),
              React.createElement(
                'dl',
                { key: 'values' },
                learning.pairs.flatMap((pair, index) => [
                  React.createElement(
                    'dt',
                    { key: `q${index}` },
                    pair.question
                  ),
                  React.createElement(
                    'dd',
                    {
                      key: `a${index}`,
                      style: {
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                      },
                    },
                    pair.text
                  ),
                ])
              ),
            ])
          : null,
      ])
    : null;
};
