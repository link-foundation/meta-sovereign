// Reporting messages (R-Y175; learned, never copied): "Report" on another
// person's message in a group or channel, in the message menu and on the
// selection's bar, walks the same list of reasons as reporting a whole
// chat (the dialog of ./chat-peer-actions.js, here with the message ids):
// nothing is sent but by the explicit last click in the dialog.

import React, { useState } from 'react';
import { useT } from './i18n.js';
import { networkMessageId } from './chat-model.js';
import { ReportDialog } from './chat-peer-actions.js';
import { canReport } from './chat-selection.js';
import { expandAlbums } from './chat-album.js';

const el = React.createElement;

// Telegram's own limit of messages in one report.
const MAX_REPORTED = 100;

/** The network ids of the reportable messages among `messages`. */
export const reportIds = (messages, chat) =>
  messages
    .filter((m) => canReport(m, chat))
    .map((m) => networkMessageId(m))
    .filter((id) => id !== null)
    .slice(0, MAX_REPORTED);

/**
 * `{ open(messages), dialog }`: `open` starts a report of those messages
 * of the open chat; `dialog` is the dialog while one is open. `onDone`
 * runs when the dialog closes (the selection clears).
 */
export const useReport = ({ api, chat, onDone }) => {
  const t = useT();
  const [ids, setIds] = useState(null);
  const close = () => {
    setIds(null);
    onDone?.();
  };
  const open = (messages) => {
    const found = reportIds(messages, chat ?? {});
    if (found.length > 0) {
      setIds(found);
    }
  };
  return {
    // The menu's Report (one message) and Report selected.
    actions: (message, chosen) => ({
      report: () => open(expandAlbums([message])),
      reportSelected: () => open(chosen()),
    }),
    // The selection bar's REPORT n, when every selected message allows it.
    top: (messages) => ({
      canReport:
        messages.length > 0 &&
        reportIds(messages, chat ?? {}).length === messages.length,
      onReport: () => open(messages),
    }),
    dialog: ids
      ? el(ReportDialog, { key: 'report', api, chat, ids, onClose: close, t })
      : null,
  };
};
