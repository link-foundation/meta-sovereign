import React from 'react';
import { useT } from './i18n.js';
import { vkStickerPreview } from '../greetings/catalog.js';

const el = React.createElement;
export const GratitudeFields = ({
  form,
  set,
  error,
  Input,
  Check,
  ordered = false,
}) => {
  const t = useT();
  const p = { form, set, error };
  return el('div', { 'data-gratitude-fields': true }, [
    el(
      'p',
      { key: 'hint', className: 'meta' },
      t(ordered ? 'engagement.hint' : 'gratitude.hint')
    ),
    ordered
      ? null
      : el(Check, {
          ...p,
          key: 'prefer',
          name: 'preferSticker',
          label: t('gratitude.preferSticker'),
        }),
    el(Input, {
      ...p,
      key: 'ids',
      name: 'gratitudeStickers',
      label: t('gratitude.stickers'),
      hint: t(ordered ? 'engagement.stickersHint' : 'gratitude.stickersHint'),
    }),
  ]);
};

export const GratitudeSticker = ({ draft, editable = false }) => {
  const t = useT();
  if (!draft.sticker || draft.text) {
    return null;
  }
  const id = String(draft.sticker.id);
  if (!/^[1-9]\d{0,9}$/u.test(id)) {
    return null;
  }
  const label = t('gratitude.preview', { id });
  return el('figure', { 'data-gratitude-sticker': id }, [
    el('img', {
      key: 'image',
      src: vkStickerPreview(id),
      alt: label,
      width: 128,
      height: 128,
      loading: 'lazy',
    }),
    el('figcaption', { key: 'caption' }, label),
    editable
      ? el('p', { key: 'hint', className: 'meta' }, t('gratitude.editHint'))
      : null,
  ]);
};
