// meta-sovereign web UI — vanilla-JS SPA. The store at the centre is
// browser-local (R-A2/R-A3 + R-Offline). When a server is reachable
// the SPA also replicates over /ws so the same data is consistent
// across devices; when offline the SPA still works fully on the
// device's own storage.

import { api } from './dom.js';
import {
  chatView,
  operatorView,
  contactsView,
  automationView,
  patternsView,
  repliesView,
  factsView,
  audienceView,
  broadcastView,
  profileView,
  statusView,
} from './views.js';

const root = document.getElementById('root');
const nav = document.querySelector('.topbar nav');
const topbar = document.querySelector('.topbar');

const badge = document.createElement('span');
badge.className = 'mode-badge offline';
badge.textContent = '…';
topbar.append(badge);

const setBadge = (online) => {
  badge.textContent = online ? 'online' : 'offline';
  badge.classList.toggle('offline', !online);
  badge.classList.toggle('online', online);
};

api.isOnline().then(setBadge);
api.on((e) => {
  if (e.type === 'mode-change') {
    setBadge(e.online);
  }
});

const views = {
  chat: chatView,
  operator: operatorView,
  contacts: contactsView,
  automation: automationView,
  patterns: patternsView,
  replies: repliesView,
  facts: factsView,
  audience: audienceView,
  broadcast: broadcastView,
  profile: profileView,
  status: statusView,
};

const show = async (name) => {
  for (const b of nav.querySelectorAll('button')) {
    b.classList.toggle('active', b.dataset.view === name);
  }
  root.innerHTML = '';
  root.append(await views[name]());
};

nav.addEventListener('click', (e) => {
  const v = e.target.dataset?.view;
  if (v) {
    show(v).catch((err) => {
      root.textContent = String(err);
    });
  }
});

show('chat').catch((err) => {
  root.textContent = String(err);
});
