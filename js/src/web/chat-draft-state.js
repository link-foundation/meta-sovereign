import { useRef, useState } from 'react';

// Closing a preview is distinct from skipping its automation. Keep unsent
// edits through refreshes and let an explicit test reopen the same preview.
export const useDraftPresentation = (loaded, setDrafts, current, onDismiss) => {
  const [hidden, setHidden] = useState(() => new Set());
  const [focusId, setFocusId] = useState(null);
  const edits = useRef(new Map());
  const visible = (loaded ?? [])
    .filter(
      (draft) =>
        draft.source === current?.source &&
        String(draft.chat) === String(current?.chat) &&
        !hidden.has(draft.id)
    )
    .map((draft) =>
      edits.current.has(draft.id)
        ? { ...draft, text: edits.current.get(draft.id) }
        : draft
    );
  return {
    drafts: visible,
    focusId,
    presented: () => setFocusId(null),
    present(ready) {
      const ids = new Set(ready.map((draft) => draft.id));
      setHidden((before) => new Set([...before].filter((id) => !ids.has(id))));
      setDrafts((before) => [
        ...new Map(
          [...ready, ...(before ?? [])].map((draft) => [draft.id, draft])
        ).values(),
      ]);
      setFocusId(ready[0]?.id ?? null);
    },
    dismiss(id) {
      setHidden((before) => new Set(before).add(id));
      setFocusId(null);
      onDismiss(null);
    },
    edit(id, text) {
      edits.current.set(id, text);
      setDrafts((before) =>
        before.map((draft) => (draft.id === id ? { ...draft, text } : draft))
      );
    },
    forget: (id) => edits.current.delete(id),
  };
};
