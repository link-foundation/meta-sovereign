// "Block user" in the Replies chat (R-Y217; learned, never copied): the
// message's menu there blocks the person who replied (the sender of the
// message is hidden by Telegram, so the block goes by the message,
// contacts.blockFromReplies). A small dialog asks what else to do: delete
// the message, delete all their messages, report spam. Nothing is sent but
// by its last click.

import React, { useState } from 'react';
import { useT } from './i18n.js';
import { FormDialog } from './chat-create.js';
import { networkMessageId } from './chat-model.js';

const el = React.createElement;

const OPTIONS = [
  ['deleteMessage', 'chat.replies.deleteMessage'],
  ['deleteHistory', 'chat.replies.deleteHistory'],
  ['reportSpam', 'chat.replies.reportSpam'],
];

/** The request body for message `msgId` and the boxes ticked in `chosen`. */
export const blockBody = (msgId, chosen = {}) => ({
  msgId,
  ...Object.fromEntries(
    OPTIONS.filter(([key]) => chosen[key]).map(([key]) => [key, true])
  ),
});

const BlockDialog = ({ api, id, close }) => {
  const t = useT();
  const [chosen, setChosen] = useState({});
  const [state, setState] = useState({ busy: false, error: null });
  const submit = async () => {
    setState({ busy: true, error: null });
    const answer = await api
      .telegramBlockFromReplies(blockBody(id, chosen))
      .catch(() => null);
    if (answer?.ok) {
      close();
    } else {
      setState({ busy: false, error: t('chat.replies.failed') });
    }
  };
  return el(
    FormDialog,
    {
      name: 'block-from-replies',
      title: t('chat.replies.blockTitle'),
      onClose: close,
      onSubmit: submit,
      submit: t('chat.replies.blockSend'),
      busy: state.busy,
      error: state.error,
      outside: true,
    },
    [
      el('p', { key: 'h', className: 'meta' }, t('chat.replies.blockHint')),
      ...OPTIONS.map(([key, label]) =>
        el('label', { key, className: 'peer-share' }, [
          el('input', {
            key: 'c',
            type: 'checkbox',
            checked: Boolean(chosen[key]),
            'data-field': key,
            onChange: (e) => setChosen({ ...chosen, [key]: e.target.checked }),
          }),
          ` ${t(label)}`,
        ])
      ),
    ]
  );
};

/** `{ actions(message), dialog }`: the menu's Block user and its dialog. */
export const useBlockFromReplies = ({ api }) => {
  const [id, setId] = useState(null);
  return {
    actions: (message) => ({
      blockSender: () => setId(networkMessageId(message)),
    }),
    dialog:
      id !== null && typeof api?.telegramBlockFromReplies === 'function'
        ? el(BlockDialog, {
            key: 'block-replies',
            api,
            id,
            close: () => setId(null),
          })
        : null,
  };
};
