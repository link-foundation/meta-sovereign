// meta-sovereign web UI — vanilla-JS SPA backed by the local HTTP server.
// All state lives in the local store (R-A2/A3); this client is a thin view.

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
    show(v);
  }
});

show('chat').catch((err) => {
  root.textContent = String(err);
});
