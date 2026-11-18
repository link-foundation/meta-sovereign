import { personalReplyKinds } from './contextual-replies.js';

// Bind reviewed routing, content and evidence, excluding queue bookkeeping.
export const draftConfirmationKey = (draft) =>
  JSON.stringify([
    draft.id,
    draft.automation,
    draft.source,
    draft.chat,
    draft.contact ?? null,
    draft.form,
    draft.text,
    draft.answer ?? null,
    draft.sticker ?? null,
    ...personalReplyKinds.map((key) => draft[key] ?? null),
  ]);
