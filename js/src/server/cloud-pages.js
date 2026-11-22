import { fail, text } from './util.js';

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]
  );

const root = '/_cloud';
export const CLOUD_SIGN_IN = `${root}/sign-in`;
export const CLOUD_SIGN_OUT = `${root}/sign-out`;

const stylesheet = '<link rel="stylesheet" href="/_cloud/brand.css" />';
const logo = '<img class="cloud-logo" src="/_cloud/logo.png" alt="" />';
const favicon = '<link rel="icon" type="image/png" href="/_cloud/logo.png" />';

export const cloudIndex = (template, { name, logo: picture }) => {
  const brand = escapeHtml(name);
  return template
    .replace(
      '<title>meta-sovereign</title>',
      () =>
        `<title>${brand}</title><meta name="ms-cloud" content="${brand}" />${picture ? favicon : ''}`
    )
    .replace('</head>', `  ${stylesheet}\n</head>`)
    .replace('<script src="./discovery-shell.js"></script>', '')
    .replace('<h1>meta-sovereign</h1>', () => `<h1>${brand}</h1>`);
};

const labels = {
  en: [
    'Workspace access key',
    'Sign in',
    'Check the access key and try again.',
    'Too many attempts. Try again in a minute.',
  ],
  ru: [
    'Ключ доступа к рабочему пространству',
    'Войти',
    'Проверьте ключ и повторите попытку.',
    'Слишком много попыток. Попробуйте через минуту.',
  ],
  hi: [
    'कार्यस्थान की प्रवेश कुंजी',
    'साइन इन करें',
    'प्रवेश कुंजी जाँचें और फिर कोशिश करें।',
    'बहुत अधिक प्रयास। एक मिनट में फिर कोशिश करें।',
  ],
  zh: [
    '工作区访问密钥',
    '登录',
    '请检查访问密钥后重试。',
    '尝试次数过多，请在一分钟后重试。',
  ],
};

export const signInPage = (req, res, brand, status = 200) => {
  const requested = String(req.headers['accept-language'] ?? '')
    .slice(0, 256)
    .match(/^[a-z]{2}/i)?.[0]
    ?.toLowerCase();
  const language = Object.hasOwn(labels, requested) ? requested : 'en';
  const [key, signIn, invalid, limited] = labels[language];
  const name = escapeHtml(brand.name);
  const error = status === 401 ? invalid : status === 429 ? limited : '';
  text(
    res,
    status,
    `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${name} · ${signIn}</title>
${stylesheet}
${brand.logo ? favicon : ''}
</head>
<body class="cloud-login">
<main class="cloud-login-card">
<h1>${brand.logo ? logo : ''}${name}</h1>
<form method="post" action="${CLOUD_SIGN_IN}">
<label for="workspace-key">${key}</label>
<input id="workspace-key" name="key" type="password" autocomplete="current-password" maxlength="64" required />
${error ? `<p class="cloud-login-error" role="alert">${error}</p>` : ''}
<button type="submit">${signIn}</button>
</form>
</main>
</body>
</html>`,
    'text/html; charset=utf-8'
  );
};

const cloudCss = (accent, hasLogo) => `
:root {
  color-scheme: light dark;
  --workspace-accent: ${accent ?? '#4379a5'};
}
${
  accent
    ? `
:root[data-theme="light"][data-skin="t3"] {
  --accent: color-mix(in srgb, var(--workspace-accent) 45%, #000);
  --accent-fill: var(--accent);
}
:root[data-theme="dark"][data-skin="t3"] {
  --accent: color-mix(in srgb, var(--workspace-accent) 45%, #fff);
  --accent-fill: color-mix(in srgb, var(--workspace-accent) 25%, #121315);
}
`
    : ''
}
#app[hidden] { display: none; }
.topbar form { margin: 0; flex: 0 0 auto; }
${hasLogo ? '.topbar h1::before { content: ""; width: 1.25em; height: 1.25em; display: inline-block; vertical-align: middle; margin-inline-end: .4em; background: url("/_cloud/logo.png") center / contain no-repeat; }' : ''}
.cloud-login {
  font: 1rem system-ui, sans-serif;
  color: CanvasText;
  background: Canvas;
  min-height: 100dvh;
  margin: 0;
  display: grid;
  place-items: center;
}
.cloud-login-card {
  box-sizing: border-box;
  width: min(100% - 2rem, 25rem);
  border: 1px solid color-mix(in srgb, CanvasText 24%, Canvas);
  border-block-start: 3px solid var(--workspace-accent);
  border-radius: .75rem;
  padding: 1.75rem;
}
.cloud-login-card h1 { display: flex; gap: .5rem; align-items: center; margin: 0 0 1.5rem; font-size: 1.3rem; overflow-wrap: anywhere; }
.cloud-logo { width: 2rem; height: 2rem; object-fit: contain; }
.cloud-login-card form { display: grid; gap: .75rem; }
.cloud-login-card input, .cloud-login-card button {
  min-width: 0;
  font: inherit;
  border: 1px solid color-mix(in srgb, CanvasText 38%, Canvas);
  border-radius: .375rem;
  padding: .65rem .75rem;
}
.cloud-login-card button { cursor: pointer; }
.cloud-login-error { margin: 0; }
`;

export const cloudAsset = (res, pathname, brand) => {
  if (pathname === `${root}/brand.css`) {
    return text(
      res,
      200,
      cloudCss(brand.accent, Boolean(brand.logo)),
      'text/css; charset=utf-8'
    );
  }
  if (pathname === `${root}/logo.png`) {
    if (brand.logo) {
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(brand.logo);
      return;
    }
    return fail(res, 404, 'not-found', 'workspace logo unavailable');
  }
  return false;
};
