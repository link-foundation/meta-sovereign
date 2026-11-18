import React from 'react';

export const ApplicationCollectionReceipt = ({ receipt, t }) => {
  const state = receipt.testMode
    ? 'preview'
    : receipt.collectVacancies === false
      ? 'memory'
      : 'enabled';
  const key = {
    preview: 'collectionPreview',
    memory: 'collectionMemory',
    enabled: 'collectionEnabled',
  }[state];
  return React.createElement(
    'p',
    { 'data-application-collection': state },
    t(`application.${key}`)
  );
};
