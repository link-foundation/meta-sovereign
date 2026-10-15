// Render a React node to static markup inside a LocaleContext for a given
// locale — the helper half a dozen web-component tests each defined on their
// own. It uses the app's own `translate`, so the test translator can never
// drift from the real one.

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { LocaleContext, availableLocales, translate } from '../src/web/i18n.js';

export const renderInLocale = (locale, node) => {
  const ctx = {
    locale,
    t: (key, vars) => translate(locale, key, vars),
    setLocale: () => {},
    clearLocale: () => {},
    available: availableLocales,
  };
  return renderToStaticMarkup(
    React.createElement(LocaleContext.Provider, { value: ctx }, node)
  );
};

// A `(state, locale) => markup` renderer for a screen component that takes a
// single `state` prop — the shape several screen tests repeat.
export const screenRenderer =
  (Component) =>
  (state, locale = 'en') =>
    renderInLocale(locale, React.createElement(Component, { state }));
