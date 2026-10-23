// A dialog drawn over the whole page, from inside a message (R-Y176,
// R-Y184): a message sits in the wall's own stacking context, so the dialog
// goes to the document's body. Apart from chat-paid.js so the message cards
// can use it without a cycle.

import React from 'react';
import { createPortal } from 'react-dom';

const el = React.createElement;

// Over everything.
// What happens in the dialog stays out of the message under it (a click
// there would select it).
const stop = (event) => event.stopPropagation();
export const overPage = (dialog) => {
  const body = globalThis.document?.body;
  const wrapped = el(
    'div',
    {
      className: 'paid-portal',
      onClick: stop,
      onMouseDown: stop,
      onContextMenu: stop,
      onDoubleClick: stop,
    },
    dialog
  );
  return body ? createPortal(wrapped, body) : wrapped;
};
