// meta-sovereign web UI — minimal SPA backed by the local HTTP server.
// All state lives in the local store (R-A2/A3); this client is a thin view.

const root = document.getElementById('root');
const nav = document.querySelector('.topbar nav');

const api = {
  links: () => fetch('/links').then((r) => r.json()),
  put: (link) =>
    fetch('/links', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(link),
    }).then((r) => r.json()),
  del: (id) =>
    fetch(`/links/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) =>
      r.json()
    ),
  sources: () => fetch('/sources').then((r) => r.json()),
  contacts: () => fetch('/api/contacts').then((r) => r.json()),
  patterns: () => fetch('/api/patterns').then((r) => r.json()),
  inferRegex: (examples) =>
    fetch('/api/patterns/infer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ examples }),
    }).then((r) => r.json()),
  graphs: () => fetch('/api/graphs').then((r) => r.json()),
  saveGraph: (g) =>
    fetch('/api/graphs', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(g),
    }).then((r) => r.json()),
  status: () => fetch('/api/status').then((r) => r.json()),
};

const h = (tag, attrs = {}, children = []) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'on') {
      for (const [evt, fn] of Object.entries(v)) {
        el.addEventListener(evt, fn);
      }
    } else if (k === 'class') {
      el.className = v;
    } else if (v !== false && v !== null && v !== undefined) {
      el.setAttribute(k, v);
    }
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined) {
      continue;
    }
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
};

const views = {
  async chat() {
    const links = await api.links();
    const messages = links.filter((l) => l.id?.startsWith('msg:'));
    const chats = [...new Set(messages.map((m) => `${m.source}:${m.chat}`))];
    let active = chats[0];

    const wrap = h('div', { class: 'chat' });
    const aside = h('aside', {}, [
      h('div', { style: 'padding: 0.4rem; opacity: 0.7' }, 'Chats'),
      ...chats.map((c) =>
        h(
          'button',
          {
            class: c === active ? 'active' : '',
            on: {
              click: () => {
                active = c;
                render();
              },
            },
          },
          c
        )
      ),
    ]);
    const stream = h('div', { class: 'stream' });
    wrap.append(aside, stream);

    const render = () => {
      stream.innerHTML = '';
      for (const m of messages.filter(
        (m) => `${m.source}:${m.chat}` === active
      )) {
        stream.append(
          h('div', { class: 'msg' }, [
            h('div', { class: 'meta' }, `${m.sender} • ${m.timestamp ?? ''}`),
            h('div', {}, m.body ?? ''),
          ])
        );
      }
    };
    render();
    return wrap;
  },

  async contacts() {
    const contacts = await api.contacts();
    return h('div', {}, [
      h('h2', {}, 'Contacts'),
      h('table', {}, [
        h('thead', {}, [
          h('tr', {}, [
            h('th', {}, 'Identity'),
            h('th', {}, 'Networks'),
            h('th', {}, 'Messages'),
          ]),
        ]),
        h(
          'tbody',
          {},
          contacts.map((c) =>
            h('tr', {}, [
              h('td', {}, c.id),
              h('td', {}, (c.networks ?? []).join(', ')),
              h('td', {}, String(c.messageCount ?? 0)),
            ])
          )
        ),
      ]),
    ]);
  },

  async automation() {
    const graphs = await api.graphs();
    const wrap = h('div', { class: 'col' });
    const list = h('div', { class: 'col' });
    const editor = h('div', { class: 'graph' });
    let current = graphs[0] ?? { id: 'graph:default', nodes: [], edges: [] };

    const drawEditor = () => {
      editor.innerHTML = '';
      editor.append(
        h(
          'div',
          {},
          (current.nodes ?? []).map((n) =>
            h('span', { class: 'node' }, `${n.kind}: ${n.label ?? n.id}`)
          )
        ),
        h(
          'div',
          { style: 'opacity: 0.6; margin-top: 0.5rem' },
          `${(current.edges ?? []).length} edges`
        )
      );
    };

    const drawList = () => {
      list.innerHTML = '';
      for (const g of graphs) {
        list.append(
          h(
            'button',
            {
              on: {
                click: () => {
                  current = g;
                  drawEditor();
                },
              },
            },
            g.id
          )
        );
      }
    };

    const addNode = (kind) => {
      current.nodes = current.nodes ?? [];
      const id = `${kind}-${current.nodes.length + 1}`;
      current.nodes.push({ id, kind, label: id });
      drawEditor();
    };

    drawList();
    drawEditor();
    wrap.append(
      h('h2', {}, 'Automation graphs'),
      h('div', { class: 'row' }, [
        h('button', { on: { click: () => addNode('pattern') } }, '+ pattern'),
        h('button', { on: { click: () => addNode('reply') } }, '+ reply'),
        h('button', { on: { click: () => addNode('send') } }, '+ send'),
        h(
          'button',
          {
            class: 'primary',
            on: {
              click: async () => {
                await api.saveGraph(current);
              },
            },
          },
          'save'
        ),
      ]),
      list,
      editor
    );
    return wrap;
  },

  async patterns() {
    const patterns = await api.patterns();
    const wrap = h('div', { class: 'col' });
    const ta = h('textarea', { rows: 5, placeholder: 'one example per line' });
    const out = h('pre');
    wrap.append(
      h('h2', {}, 'Patterns'),
      h('table', {}, [
        h('thead', {}, [
          h('tr', {}, [h('th', {}, 'id'), h('th', {}, 'regex')]),
        ]),
        h(
          'tbody',
          {},
          patterns.map((p) =>
            h('tr', {}, [h('td', {}, p.id), h('td', {}, p.regex ?? '')])
          )
        ),
      ]),
      h('h3', {}, 'Infer regex from examples'),
      ta,
      h(
        'button',
        {
          class: 'primary',
          on: {
            click: async () => {
              const examples = ta.value.split('\n').filter(Boolean);
              const r = await api.inferRegex(examples);
              out.textContent = r.regex;
            },
          },
        },
        'infer'
      ),
      out
    );
    return wrap;
  },

  async broadcast() {
    const sources = await api.sources();
    const wrap = h('div', { class: 'col' });
    const msg = h('textarea', { rows: 4 });
    const targets = h(
      'div',
      { class: 'row' },
      sources.map((s) =>
        h('label', { class: 'row' }, [
          h('input', { type: 'checkbox', value: s, checked: true }),
          h('span', {}, s),
        ])
      )
    );
    const status = h('div');
    wrap.append(
      h('h2', {}, 'Broadcast'),
      msg,
      targets,
      h(
        'button',
        {
          class: 'primary',
          on: {
            click: () => {
              status.textContent = `queued to ${[...targets.querySelectorAll('input:checked')].length} networks (offline mode)`;
            },
          },
        },
        'send'
      ),
      status
    );
    return wrap;
  },

  async status() {
    const s = await api.status();
    return h('div', {}, [
      h('h2', {}, 'Status'),
      h('pre', {}, JSON.stringify(s, null, 2)),
    ]);
  },
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
