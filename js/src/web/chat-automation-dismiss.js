import { useEffect, useRef } from 'react';

export const useAutomationDismiss = (open, close) => {
  const box = useRef(null);
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const pointer = (event) => {
      if (!box.current?.contains(event.target)) {
        close();
      }
    };
    const key = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        box.current?.querySelector('[data-action="chat-automations"]')?.focus();
      }
    };
    globalThis.addEventListener('pointerdown', pointer);
    globalThis.addEventListener('keydown', key);
    return () => {
      globalThis.removeEventListener('pointerdown', pointer);
      globalThis.removeEventListener('keydown', key);
    };
  }, [open, close]);
  return box;
};
