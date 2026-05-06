// Reads the four locale files, injects the per-provider setup-step
// keys after the `connections.openDetail` line. Idempotent — re-runs
// remove the previous injection block (delimited by markers) before
// writing the new one.

import fs from 'node:fs';
import path from 'node:path';

const PROVIDERS = {
  email: 'Email',
  telegram: 'Telegram',
  vk: 'VK',
  x: 'X (Twitter)',
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  'habr-career': 'career.habr.com',
  hh: 'hh.ru',
  github: 'GitHub',
  upwork: 'Upwork',
  peopleperhour: 'PeoplePerHour',
  superjob: 'SuperJob',
};

const TEMPLATES = {
  en: {
    step1: {
      title: 'Prepare your {label} credential',
      body: 'Open the linked docs and create an API token, OAuth credential, or developer key as the upstream service requires.',
    },
    step2: {
      title: 'Save it inside meta-sovereign',
      body: 'Paste the credential into the field on this screen. The value is stored under a `secret:*` key and never leaves your browser.',
    },
    step3: {
      title: 'Run the probe',
      body: 'Tap "Probe connection" — a successful response confirms the credential. Failures surface a translated hint with the exact next action.',
    },
  },
  ru: {
    step1: {
      title: 'Подготовьте учётные данные {label}',
      body: 'Откройте документацию по ссылке и создайте API-токен, OAuth-приложение или ключ разработчика так, как требует сервис.',
    },
    step2: {
      title: 'Сохраните данные в meta-sovereign',
      body: 'Вставьте полученное значение в поле на этом экране. Оно хранится под ключом `secret:*` и никогда не покидает браузер.',
    },
    step3: {
      title: 'Запустите проверку',
      body: 'Нажмите «Проверить соединение» — успешный ответ подтвердит учётные данные. При ошибке появится перевод подсказки со следующим действием.',
    },
  },
  zh: {
    step1: {
      title: '准备 {label} 凭据',
      body: '打开下方文档链接,按上游服务的要求创建 API 令牌、OAuth 凭据或开发者密钥。',
    },
    step2: {
      title: '保存到 meta-sovereign',
      body: '将凭据粘贴到此页面的字段。值会以 `secret:*` 键保存,绝不会离开浏览器。',
    },
    step3: {
      title: '执行探测',
      body: '点击"探测连接"——返回成功即说明凭据有效。失败时会显示带下一步操作的翻译提示。',
    },
  },
  hi: {
    step1: {
      title: '{label} क्रेडेंशियल तैयार करें',
      body: 'नीचे दिए गए दस्तावेज़ खोलें और सेवा की आवश्यकता के अनुसार API टोकन, OAuth क्रेडेंशियल या डेवलपर कुंजी बनाएँ।',
    },
    step2: {
      title: 'meta-sovereign में सहेजें',
      body: 'क्रेडेंशियल को इस स्क्रीन पर फ़ील्ड में चिपकाएँ। यह `secret:*` कुंजी के तहत सहेजा जाता है और कभी ब्राउज़र नहीं छोड़ता।',
    },
    step3: {
      title: 'जाँच चलाएँ',
      body: '"कनेक्शन जाँचें" पर टैप करें — सफल उत्तर क्रेडेंशियल की पुष्टि करता है। विफल होने पर अगले कदम के साथ अनुवादित संकेत दिखेगा।',
    },
  },
};

const buildBlock = (locale) => {
  const tpl = TEMPLATES[locale];
  const lines = [];
  for (const [id, label] of Object.entries(PROVIDERS)) {
    for (const stepId of ['step1', 'step2', 'step3']) {
      const t = tpl[stepId].title.replace('{label}', label);
      const b = tpl[stepId].body;
      lines.push(
        `  'connections.${id}.setup.${stepId}.title': ${JSON.stringify(t)},`
      );
      lines.push(`  'connections.${id}.setup.${stepId}.body':`);
      lines.push(`    ${JSON.stringify(b)},`);
    }
  }
  return lines.join('\n');
};

const ROOT = path.resolve(import.meta.dirname, '..');
const ANCHOR = "  'connections.openDetail': ";
const START_MARK = '  // BEGIN setup-steps (issue #25 R-N8) — auto-generated';
const END_MARK = '  // END setup-steps';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

for (const locale of Object.keys(TEMPLATES)) {
  const file = path.join(ROOT, 'js/src/web/locales', `${locale}.js`);
  let src = fs.readFileSync(file, 'utf8');
  // Remove any prior injection.
  const re = new RegExp(
    `\\n${escapeRe(START_MARK)}[\\s\\S]*?${escapeRe(END_MARK)}\\n`,
    'g'
  );
  src = src.replace(re, '\n');
  // Find the openDetail line and append after it.
  const idx = src.indexOf(ANCHOR);
  if (idx < 0) {
    throw new Error(`anchor not found in ${file}`);
  }
  // Move past the line ending.
  const lineEnd = src.indexOf('\n', idx);
  const block = `\n${START_MARK}\n${buildBlock(locale)}\n${END_MARK}`;
  const updated = src.slice(0, lineEnd) + block + src.slice(lineEnd);
  fs.writeFileSync(file, updated);
  console.log(`updated ${file}`);
}
