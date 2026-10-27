import { useEffect, useState } from 'react';

export const OPERATOR_ORDER_KEY = 'metaSovereignOperatorOrder';

export const readOperatorOrder = (storage = globalThis.sessionStorage) => {
  try {
    const order = JSON.parse(storage?.getItem(OPERATOR_ORDER_KEY) ?? 'null');
    return Array.isArray(order)
      ? [...new Set(order.filter((key) => typeof key === 'string'))]
      : [];
  } catch {
    return [];
  }
};

export const postponeOperatorChat = (order, key) => [
  ...order.filter((before) => before !== key),
  key,
];

// Skipped cards keep their place across section changes and reloads in this tab.
export const useOperatorOrder = (chats, loading) => {
  const [order, setOrder] = useState(readOperatorOrder);
  useEffect(() => {
    if (!loading) {
      const unread = new Set(
        chats.filter((chat) => chat.unread > 0).map((chat) => chat.key)
      );
      setOrder((before) => {
        const kept = before.filter((key) => unread.has(key));
        return kept.length === before.length ? before : kept;
      });
    }
  }, [chats, loading]);
  useEffect(() => {
    try {
      globalThis.sessionStorage?.setItem(
        OPERATOR_ORDER_KEY,
        JSON.stringify(order)
      );
    } catch {
      // The queue still works for this visit when storage is unavailable.
    }
  }, [order]);
  return [order, setOrder];
};
