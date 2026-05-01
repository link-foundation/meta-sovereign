// Tiny DOM helper used across views — keeps view modules small.
export const h = (tag, attrs = {}, children = []) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'on') {
      for (const [evt, fn] of Object.entries(v)) {
        el.addEventListener(evt, fn);
      }
    } else if (k === 'class') {
      el.className = v;
    } else if (k === 'value') {
      el.value = v;
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

export const api = {
  links: () => fetch('/links').then((r) => r.json()),
  get: (id) => fetch(`/links/${encodeURIComponent(id)}`).then((r) => r.json()),
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
  putPattern: (p) =>
    fetch('/api/patterns', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(p),
    }).then((r) => r.json()),
  inferRegex: (examples, mode = 'simple') =>
    fetch('/api/patterns/infer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ examples, mode }),
    }).then((r) => r.json()),
  graphs: () => fetch('/api/graphs').then((r) => r.json()),
  saveGraph: (g) =>
    fetch('/api/graphs', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(g),
    }).then((r) => r.json()),
  runGraph: (id, message, mode = 'semi') =>
    fetch('/api/graphs/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, message, mode }),
    }).then((r) => r.json()),
  replies: () => fetch('/api/replies').then((r) => r.json()),
  putReply: (g) =>
    fetch('/api/replies', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(g),
    }).then((r) => r.json()),
  status: () => fetch('/api/status').then((r) => r.json()),
  autocomplete: (q, me = 'me') =>
    fetch(
      `/api/autocomplete?q=${encodeURIComponent(q)}&me=${encodeURIComponent(me)}`
    ).then((r) => r.json()),
  audience: (q) =>
    fetch(`/api/audience?q=${encodeURIComponent(q)}`).then((r) => r.json()),
  facts: () => fetch('/api/facts').then((r) => r.json()),
  search: (q) =>
    fetch(`/api/search?q=${encodeURIComponent(q)}`).then((r) => r.json()),
  profile: () => fetch('/api/profile').then((r) => r.json()),
  putProfile: (p) =>
    fetch('/api/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(p),
    }).then((r) => r.json()),
  resume: () => fetch('/api/resume').then((r) => r.json()),
  putResume: (p) =>
    fetch('/api/resume', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(p),
    }).then((r) => r.json()),
  broadcast: (text, networks) =>
    fetch('/api/broadcast', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, networks }),
    }).then((r) => r.json()),
};
