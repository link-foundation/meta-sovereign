/**
 * Download landing page (issue #37): renders `model.js` view models
 * into `index.html`. No framework and no build step, so the page is
 * served as-is from GitHub Pages at `/download/` and stays usable when
 * the app bundle is not loaded.
 */

import { COPY, LOCALE_NAMES } from './copy.js';
import {
  RELEASES_URL,
  REPOSITORY,
  detectPlatformPrecise,
} from './downloads.js';
import {
  LOCALES,
  LOCALE_STORAGE_KEY,
  MACOS_QUARANTINE_COMMAND,
  SERVER_COMMANDS,
  buildViewModel,
  assetMeta,
  loadDesktopRelease,
  optionLabel,
  pickLocale,
  translate,
} from './model.js';
import { verifyChecksum } from './verify.js';

const REPO_URL = `https://github.com/${REPOSITORY}`;
const GUIDE_URL = `${REPO_URL}/blob/main/docs/USER-GUIDE.md`;

const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('on')) {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== null && value !== undefined && value !== false) {
      node.setAttribute(key, value === true ? '' : value);
    }
  }
  node.append(...children.flat().filter((child) => child !== null));
  return node;
};

const storage = (kind) => {
  try {
    return globalThis[kind] ?? null;
  } catch {
    return null; // sandboxed iframes throw on storage access
  }
};

const state = {
  locale: pickLocale({
    search: location.search,
    stored: storage('localStorage')?.getItem(LOCALE_STORAGE_KEY),
    languages: navigator.languages ?? [navigator.language],
  }),
  status: 'loading',
  release: null,
  platform: { os: null, arch: null },
  selectedOs: null,
};

const t = (key, vars) => translate(state.locale, key, vars);

const commandBlock = (command) =>
  el(
    'div',
    { class: 'command' },
    el('code', {}, command),
    el(
      'button',
      {
        type: 'button',
        class: 'copy',
        'aria-label': `Copy: ${command}`,
        onClick: () => navigator.clipboard?.writeText(command),
      },
      '⧉'
    )
  );

// Without the asset: the primary button still leads somewhere (the
// releases page); grid entries say why they are disabled.
const missingText = () => {
  if (state.status === 'loading') {
    return t('statusLoading');
  }
  return state.release ? t('unavailable') : t('notPublished');
};

const downloadLink = (entry, { primary = false } = {}) => {
  const label = optionLabel(entry, t);
  const href = entry.href ?? (primary ? RELEASES_URL : null);
  let meta = missingText();
  if (entry.href) {
    meta = assetMeta(entry.name, entry.size);
  } else if (href) {
    meta = t('openReleases');
  }
  const body = [
    el(
      'span',
      { class: 'label' },
      primary ? t('downloadFor', { platform: label }) : label
    ),
    el('span', { class: 'meta' }, meta),
  ];
  const cls = `${primary ? 'primary-download' : 'download'}${href ? '' : ' unavailable'}`;
  return href
    ? el('a', { class: cls, href, 'data-option': entry.id }, body)
    : el(
        'div',
        { class: cls, 'aria-disabled': 'true', 'data-option': entry.id },
        body
      );
};

const header = () =>
  el(
    'header',
    { class: 'top' },
    el(
      'a',
      { class: 'brand', href: '../' },
      el('img', { src: './icon.svg', alt: '', width: 32, height: 32 }),
      'Meta Sovereign'
    ),
    el(
      'label',
      { class: 'locale' },
      el('span', { class: 'sr-only' }, t('language')),
      el(
        'select',
        {
          onChange: (event) => {
            state.locale = event.target.value;
            storage('localStorage')?.setItem(LOCALE_STORAGE_KEY, state.locale);
            render();
          },
        },
        LOCALES.map((code) =>
          el(
            'option',
            { value: code, selected: code === state.locale },
            LOCALE_NAMES[code]
          )
        )
      )
    )
  );

const hero = (view) => {
  const os = state.selectedOs ?? state.platform.os;
  const platform = {
    os,
    arch: os === state.platform.os ? state.platform.arch : null,
  };
  const selected = buildViewModel({ release: state.release, platform });
  const statusText = {
    loading: t('statusLoading'),
    ready: t('statusReady'),
    fallback: t('statusFallback'),
  }[state.status];
  let primary;
  if (selected.primary) {
    primary = downloadLink(selected.primary, { primary: true });
  } else if (state.platform.os === 'mobile' && !state.selectedOs) {
    primary = [
      el('a', { class: 'primary-download', href: '../' }, t('openWebApp')),
      el('p', { class: 'note' }, t('mobileNote')),
    ];
  } else {
    primary = el('p', { class: 'note' }, t('chooseOs'));
  }
  return el(
    'section',
    { class: 'hero', 'aria-labelledby': 'title' },
    el('p', { class: 'eyebrow' }, t('eyebrow')),
    el('h1', { id: 'title' }, 'Meta Sovereign'),
    el('p', { class: 'tagline' }, t('tagline')),
    el(
      'p',
      { class: `status ${state.status}`, role: 'status' },
      statusText,
      view.tag ? ' ' : null,
      view.tag ? el('a', { href: view.releaseUrl }, view.tag) : null
    ),
    primary,
    el(
      'div',
      { class: 'os-tabs', role: 'group', 'aria-label': t('otherSystems') },
      ['windows', 'macos', 'linux'].map((value) =>
        el(
          'button',
          {
            type: 'button',
            'aria-pressed': String(value === os),
            onClick: () => {
              state.selectedOs = value;
              render();
            },
          },
          t(value)
        )
      )
    ),
    el(
      'nav',
      { class: 'links' },
      el('a', { href: RELEASES_URL }, t('allReleases')),
      el('a', { href: view.checksumsHref }, t('checksums')),
      el('a', { href: '../' }, t('openWebApp'))
    )
  );
};

const downloads = (view) =>
  el(
    'section',
    { class: 'card', 'aria-labelledby': 'all-downloads' },
    el('h2', { id: 'all-downloads' }, t('allDownloads')),
    el(
      'div',
      { class: 'grid' },
      view.groups.map((group) =>
        el(
          'div',
          { class: 'group' },
          el('h3', {}, t(group.os)),
          group.entries.map((entry) => downloadLink(entry))
        )
      )
    )
  );

const web = () =>
  el(
    'section',
    { class: 'card', 'aria-labelledby': 'web' },
    el('h2', { id: 'web' }, t('webTitle')),
    el('p', {}, t('webBody')),
    el('a', { class: 'button', href: '../' }, t('openWebApp')),
    el('h3', {}, t('serverTitle')),
    el('p', {}, t('serverBody')),
    commandBlock(SERVER_COMMANDS.npm),
    el('p', {}, t('serverGithubNote')),
    commandBlock(SERVER_COMMANDS.github),
    el('p', { class: 'note' }, t('safariNote'))
  );

const install = () =>
  el(
    'section',
    { class: 'card', 'aria-labelledby': 'install' },
    el('h2', { id: 'install' }, t('installTitle')),
    el(
      'dl',
      {},
      el('dt', {}, t('windows')),
      el('dd', {}, t('windowsHint')),
      el('dt', {}, t('macos')),
      el('dd', {}, t('macHint'), commandBlock(MACOS_QUARANTINE_COMMAND)),
      el('dt', {}, t('linux')),
      el('dd', {}, t('linuxHint'))
    )
  );

const verifier = (view) => {
  const result = el(
    'p',
    { class: 'result idle', role: 'status' },
    t('verifyIdle')
  );
  const fileInput = el('input', { type: 'file' });
  const sumsInput = el('input', { type: 'file', accept: '.txt,text/plain' });
  const show = (kind, text) => {
    result.className = `result ${kind}`;
    result.textContent = text;
  };
  const check = async () => {
    const [file] = fileInput.files;
    const [sums] = sumsInput.files;
    if (!file || !sums) {
      show('idle', t('verifyIdle'));
      return;
    }
    show('working', t('verifyWorking'));
    const outcome = await verifyChecksum({
      name: file.name,
      data: await file.arrayBuffer(),
      sumsText: await sums.text(),
    });
    const key = {
      match: 'verifyMatch',
      mismatch: 'verifyMismatch',
      missing: 'verifyMissing',
    }[outcome.state];
    show(
      outcome.state,
      outcome.actual ? `${t(key)} ${outcome.actual}` : t(key)
    );
  };
  fileInput.addEventListener('change', check);
  sumsInput.addEventListener('change', check);
  const sample =
    view.primary?.name ?? 'meta-sovereign-desktop-<os>-<arch>-<version>.<ext>';
  return el(
    'section',
    { class: 'card', 'aria-labelledby': 'verify' },
    el('h2', { id: 'verify' }, t('verifyTitle')),
    el('p', {}, t('verifyIntro')),
    el(
      'div',
      { class: 'inputs' },
      el('label', {}, t('verifyFile'), fileInput),
      el('label', {}, t('verifySums'), sumsInput)
    ),
    result,
    el('p', {}, t('verifyCli')),
    commandBlock('sha256sum --check --ignore-missing SHA256SUMS.txt'),
    commandBlock(`shasum -a 256 ${sample}`),
    commandBlock(`Get-FileHash .\\${sample} -Algorithm SHA256`),
    commandBlock(`gh attestation verify ${sample} --repo ${REPOSITORY}`),
    el('p', {}, el('a', { href: view.provenanceHref }, t('provenance')))
  );
};

const footer = () =>
  el(
    'footer',
    {},
    el('a', { href: REPO_URL }, t('sourceCode')),
    el('a', { href: GUIDE_URL }, t('userGuide')),
    el('a', { href: RELEASES_URL }, t('allReleases'))
  );

function render() {
  document.documentElement.lang = state.locale;
  document.title = t('pageTitle');
  const view = buildViewModel({
    release: state.release,
    platform: state.platform,
  });
  const root = document.getElementById('root');
  root.replaceChildren(
    header(),
    el(
      'main',
      {},
      hero(view),
      downloads(view),
      web(),
      install(),
      verifier(view)
    ),
    footer()
  );
  // Hooks for the Playwright check (experiments/issue-37).
  root.dataset.status = state.status;
  root.dataset.os = state.platform.os ?? '';
  root.dataset.arch = state.platform.arch ?? '';
}

const boot = async () => {
  if (!COPY[state.locale]) {
    state.locale = 'en';
  }
  render();
  const [platform, loaded] = await Promise.all([
    detectPlatformPrecise(navigator),
    loadDesktopRelease({ storage: storage('sessionStorage') }),
  ]);
  Object.assign(state, { platform, ...loaded });
  render();
};

boot();
