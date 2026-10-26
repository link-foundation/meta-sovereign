// What a personal conversation tells about the other person (R-Y50 ..
// R-Y54), beside the open chat: how we address each other ("ты" or
// "вы", agreed or as used), their work, their accounts elsewhere — a
// GitHub account marked confirmed when it links back — and the questions
// we asked, the same question in other words counted once. Read from
// `/api/people/learned`, which learns from the stored history and reads
// the rest of it first when it is not all stored yet.

import React, { useEffect, useState } from 'react';
import { useDates, useT } from './i18n.js';
import { Icon } from './icons.js';
import { PanelDivider } from './panel-resize.js';
import { Busy } from './spinner.js';
import { ProfileHead, SharedMedia } from './chat-shared.js';
import { InviteLink } from './chat-invite.js';
import { SimilarChannels } from './chat-similar.js';
import { SimilarBots } from './chat-similar-bots.js';
import { BotAttachRow } from './chat-attach-bots.js';
import { Members } from './chat-members.js';
import { PeerActions } from './chat-peer-actions.js';
import { ContactExtras } from './chat-contact-extras.js';
import { NotifyRow } from './chat-notify-settings.js';
import { CommonChatsRow } from './chat-common-chats.js';
import { ChannelDmRow } from './chat-channel-dm.js';
import { StatsRow } from './chat-stats.js';
import { BoostsRow } from './chat-boosts.js';
import { GiftsRow } from './chat-stars.js';
import { ProfileStoriesRow } from './profile-stories.js';
import { MusicRow } from './profile-music.js';
import { SendGiftRow } from './chat-send-gift.js';
import { TtlActions } from './chat-ttl.js';
import { ReactionsAction } from './chat-reactions.js';
import { SettingsAction } from './chat-settings.js';
import { ChatWallpaperAction } from './chat-wallpaper.js';
import { ChatThemeAction } from './chat-theme.js';
import { UsernamesAction } from './chat-usernames.js';
import { EditChat } from './chat-edit.js';
import { AddMembers } from './chat-add-members.js';
import { AdminActions } from './chat-admin.js';
import { InviteLinksActions } from './chat-invite-links.js';
import { PersonalChannelCard } from './chat-person-extras.js';
import { PaidEarnings } from './chat-paid-earnings.js';
import { BusinessProfile } from './chat-business-profile.js';

const el = React.createElement;
const AGAIN_MS = 10_000; // while the history is still being read

/** What the server learned about the open chat's person, or null. */
export const usePersonLearned = (api, key, open) => {
  const [learned, setLearned] = useState(null);
  useEffect(() => {
    setLearned(null);
    if (!open || !key || typeof api?.peopleLearned !== 'function') {
      return undefined;
    }
    let active = true;
    let timer = null;
    const read = () =>
      api
        .peopleLearned(key)
        .then((next) => {
          if (!active || !next || next.error) {
            return;
          }
          setLearned(next);
          if (next.complete === false) {
            timer = globalThis.setTimeout(read, AGAIN_MS);
          }
        })
        .catch(() => {});
    read();
    return () => {
      active = false;
      globalThis.clearTimeout(timer);
    };
  }, [api, key, open]);
  return learned;
};

const Section = ({ title, children }) =>
  el('section', { className: 'person-section' }, [
    el('h3', { key: 'h' }, title),
    ...React.Children.toArray(children),
  ]);

const Address = ({ address, t, dateTime }) => {
  if (!address?.form) {
    return el('p', { className: 'meta' }, t('chat.about.addressUnknown'));
  }
  const basis =
    address.basis === 'agreed'
      ? t('chat.about.agreed', { when: address.at ? dateTime(address.at) : '' })
      : t('chat.about.used', { count: address.messages ?? 0 });
  return el('p', { className: 'person-address' }, [
    el('strong', { key: 'f' }, t(`chat.about.${address.form}`)),
    el('span', { key: 'b', className: 'meta' }, ` · ${basis}`),
  ]);
};

const Work = ({ work, t }) =>
  work?.length
    ? el(
        'ul',
        { className: 'person-list' },
        work
          .slice(0, 8)
          .map((fact) =>
            el('li', { key: `${fact.kind}:${fact.value}` }, [
              el(
                'span',
                { key: 'k', className: 'meta' },
                t(`chat.about.kind.${fact.kind}`)
              ),
              ' ',
              fact.value,
            ])
          )
      )
    : el('p', { className: 'meta' }, t('chat.about.none'));

const GitHubMark = ({ github, t }) =>
  github
    ? el(
        'span',
        {
          className: `person-badge person-badge-${github.status}`,
          title: t(`chat.about.github.${github.status}`),
        },
        [
          github.status === 'confirmed'
            ? el(Icon, { key: 'i', name: 'check' })
            : null,
          t(`chat.about.github.${github.status}`),
        ]
      )
    : null;

const Accounts = ({ accounts, t }) =>
  accounts?.length
    ? el(
        'ul',
        { className: 'person-list' },
        accounts.map((account) =>
          el('li', { key: `${account.network}:${account.handle}` }, [
            el(
              'span',
              { key: 'n', className: 'meta' },
              t(`chat.about.network.${account.network}`)
            ),
            ' ',
            el(
              'a',
              {
                key: 'a',
                href: account.url,
                target: '_blank',
                rel: 'noopener noreferrer',
              },
              account.handle
            ),
            ' ',
            el(GitHubMark, { key: 'g', github: account.github, t }),
          ])
        )
      )
    : el('p', { className: 'meta' }, t('chat.about.none'));

const Asked = ({ asked, t }) =>
  asked?.length
    ? el(
        'ol',
        { className: 'person-asked' },
        asked.slice(0, 30).map((group) =>
          el('li', { key: group.text }, [
            el('div', { key: 'q', className: 'person-question' }, [
              group.text,
              group.asked > 1
                ? el(
                    'span',
                    {
                      key: 'c',
                      className: 'person-count',
                      title: group.wordings.join('\n'),
                    },
                    t('chat.about.askedTimes', { count: group.asked })
                  )
                : null,
            ]),
            el(
              'div',
              { key: 'a', className: 'person-answer meta' },
              group.answer?.text ?? t('chat.about.noAnswer')
            ),
          ])
        )
      )
    : el('p', { className: 'meta' }, t('chat.about.none'));

const Body = ({ learned, t, dateTime }) => {
  if (!learned) {
    return el(Busy, null, t('chat.about.loading'));
  }
  return [
    learned.complete === false
      ? el(
          Busy,
          { key: 'm' },
          t('chat.about.reading', { count: learned.messages })
        )
      : el(
          'p',
          { key: 'm', className: 'meta' },
          t('chat.about.messages', { count: learned.messages })
        ),
    el(Section, { key: 'ad', title: t('chat.about.address') }, [
      el(Address, { key: 'x', address: learned.address, t, dateTime }),
    ]),
    el(Section, { key: 'w', title: t('chat.about.work') }, [
      el(Work, { key: 'x', work: learned.work, t }),
    ]),
    el(Section, { key: 'ac', title: t('chat.about.accounts') }, [
      el(Accounts, { key: 'x', accounts: learned.accounts, t }),
    ]),
    el(Section, { key: 'q', title: t('chat.about.asked') }, [
      el(Asked, { key: 'x', asked: learned.asked, t }),
    ]),
  ];
};

/**
 * Where Telegram's own app opens this chat: a public username's t.me
 * page, else the person (`tg://user?id=`), a supergroup or channel at its
 * newest message (`t.me/c/`), a basic group by its id. Null elsewhere.
 */
export const telegramChatUrl = ({ source, chat, username, lastId } = {}) => {
  if (source !== 'telegram' || !chat) {
    return null;
  }
  if (username) {
    return `https://t.me/${encodeURIComponent(username)}`;
  }
  const id = String(chat);
  if (/^\d+$/.test(id)) {
    return `tg://user?id=${id}`;
  }
  if (/^-100\d+$/.test(id)) {
    const post = /^\d+$/.test(String(lastId ?? '')) ? `/${lastId}` : '';
    return `https://t.me/c/${id.slice(4)}${post}`;
  }
  return /^-\d+$/.test(id) ? `tg://openmessage?chat_id=${id.slice(1)}` : null;
};

const OpenInTelegram = ({ chat, username, lastId, t }) => {
  const href = telegramChatUrl({
    source: chat?.source,
    chat: chat?.chat,
    username,
    lastId,
  });
  return href
    ? el(
        'footer',
        { className: 'person-panel-foot' },
        el(
          'a',
          {
            className: 'button person-open-telegram',
            href,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          t('chat.about.openTelegram')
        )
      )
    : null;
};

/**
 * The panel; `onClose` hides it. Every Telegram chat's has its profile
 * and shared media (R-Y111), `info` the chat's, `onGo(id)` going to a
 * message; a personal chat's, what the conversation tells.
 */
export const PersonPanel = ({
  api,
  chat,
  info = null,
  username,
  lastId,
  onClose,
  onGo,
  onOpenChat,
  hasChat,
}) => {
  const t = useT();
  const { dateTime } = useDates();
  const personal = Boolean(chat?.personal);
  const learned = usePersonLearned(api, chat?.key, personal);
  const title = personal
    ? t('chat.about.title', { name: chat?.name ?? '' })
    : t('chat.about.chatInfo');
  return el(
    'aside',
    {
      className: 'person-panel',
      'aria-label': title,
    },
    [
      el(PanelDivider, {
        key: 'resize',
        name: 'details',
        variable: '--details-width',
        initial: 352,
        min: 240,
        max: 600,
        side: 'left',
        target: '.chat-main',
      }),
      el('header', { key: 'h', className: 'person-panel-head' }, [
        el('strong', { key: 't' }, title),
        el(
          'button',
          {
            key: 'x',
            type: 'button',
            className: 'icon-btn',
            'aria-label': t('chat.about.close'),
            title: t('chat.about.close'),
            onClick: onClose,
          },
          el(Icon, { name: 'close' })
        ),
      ]),
      el('div', { key: 'b', className: 'person-panel-body' }, [
        chat?.source === 'telegram'
          ? el(ProfileHead, { key: 'p', api, chat, info })
          : null,
        el(PersonalChannelCard, { key: 'pc', api, chat, info, onOpenChat }),
        // What this person paid to write to you (R-Y184).
        el(PaidEarnings, { key: 'pe', api, chat }),
        // A business's hours and address (R-Y180).
        el(BusinessProfile, { key: 'biz', api, chat }),
        el(EditChat, { key: 'e', api, chat, info }),
        chat?.source === 'telegram'
          ? el(InviteLink, { key: 'i', api, chat, info })
          : null,
        el(AddMembers, { key: 'am', api, chat, info }),
        el(Members, { key: 'mb', api, chat, info }),
        el(AdminActions, { key: 'ad', api, chat, info }),
        el(InviteLinksActions, { key: 'il', api, chat, info }),
        el(BoostsRow, { key: 'bo', api, chat, info }),
        // Pinned stories, saved music and a gift to send (R-Y185).
        el(ProfileStoriesRow, { key: 'ps', api, chat }),
        el(MusicRow, { key: 'mu', api, chat }),
        el(SendGiftRow, { key: 'sg', api, chat }),
        el(GiftsRow, { key: 'gf', api, chat }),
        el(StatsRow, { key: 'st', api, chat, info }),
        el(TtlActions, { key: 'ttl', api, chat, info }),
        el(ReactionsAction, { key: 'rx', api, chat, info }),
        el(SettingsAction, { key: 'cs', api, chat, info }),
        el(ChatWallpaperAction, { key: 'wall', api, chat }),
        el(ChatThemeAction, { key: 'theme', api, chat, info }),
        el(UsernamesAction, { key: 'un', api, chat, info }),
        el(NotifyRow, { key: 'nr', api, chat }),
        el(PeerActions, { key: 'pa', api, chat, info }),
        // A contact's note, photo and suggested birthday (R-Y217).
        el(ContactExtras, { key: `ce:${chat.chat}`, api, chat, info }),
        el(CommonChatsRow, { key: 'cc', api, chat, info, onOpenChat }),
        // The channel's direct messages (R-Y191).
        el(ChannelDmRow, { key: 'dm', api, chat, info }),
        el(SimilarChannels, {
          key: 'sc',
          api,
          chat,
          info,
          hasChat,
          onOpenChat,
        }),
        // The bots Telegram recommends beside a bot (R-Y194).
        el(BotAttachRow, { key: 'ba', api, chat, info }),
        el(SimilarBots, { key: 'sb', api, chat, info, onOpenChat }),
        el(SharedMedia, { key: 'm', api, chat, onGo }),
        personal ? el(Body, { key: 'l', learned, t, dateTime }) : null,
      ]),
      el(OpenInTelegram, { key: 'f', chat, username, lastId, t }),
    ]
  );
};
