/** Runs in the owned browser. Parsing is inert; exported scripts never execute. */
export const readResumeExportHtml = ({ html }) => {
  const { DOMParser } = globalThis;
  const document = new DOMParser().parseFromString(html, 'text/html');
  const text = (node) => {
    if (!node) {
      return '';
    }
    const copy = node.cloneNode(true);
    for (const hidden of copy.querySelectorAll('script,style,noscript')) {
      hidden.remove();
    }
    for (const br of copy.querySelectorAll('br')) {
      br.replaceWith('\n');
    }
    return copy.textContent.replace(/\r/gu, '').trim();
  };
  const one = (selector) => {
    const nodes = document.querySelectorAll(selector);
    return nodes.length === 1 ? text(nodes[0]) : '';
  };
  const label = text(document.body).match(
    /(?:Резюме обновлено|Resume updated|Updated)[^\n]{0,180}/iu
  )?.[0];
  const language = /^резюме обновлено/iu.test(label ?? '')
    ? 'ru'
    : /^(?:resume updated|updated)/iu.test(label ?? '')
      ? 'en'
      : null;
  const groups = [...document.querySelectorAll('.resume-skils')];
  const group = (names) => {
    const matches = groups.filter((node) =>
      names.includes(text(node.querySelector('.bloko-form-hint')))
    );
    return matches.length === 1 ? matches[0] : null;
  };
  const skills = group(['Навыки', 'Skills', 'Key skills']);
  const about = group(['Обо мне', 'About me', 'About'])?.cloneNode(true);
  about?.querySelector('.bloko-form-hint')?.remove();
  const jobs = [...document.querySelectorAll('.resume-experience')].map(
    (block) => {
      const position = block.querySelector('.resume-experience__position');
      const details = text(block.querySelector('.info'));
      const website = details.match(
        /(?:^|,\s*)((?:https?:\/\/)?(?:[\p{L}\d-]+\.)+[\p{L}]{2,}(?:[/?#][^\s]*)?)\s*$/iu
      );
      const industries = [];
      let parent = '';
      for (const child of block.children) {
        if (child === position) {
          break;
        }
        if (child.tagName === 'P' && !child.className) {
          parent = text(child);
        }
        if (child.tagName === 'UL') {
          for (const item of child.querySelectorAll('li')) {
            industries.push({ name: text(item), parent });
          }
        }
      }
      return {
        company: text(block.querySelector('.resume-experience__company')),
        position: text(position),
        period: text(block.querySelector('.bloko-form-hint')).replace(
          /\s+/gu,
          ' '
        ),
        area: (website ? details.slice(0, website.index) : details)
          .replace(/,\s*$/u, '')
          .trim(),
        website: website?.[1] ?? '',
        industries,
        description: [
          ...block.querySelectorAll('.resume-experience__position ~ p'),
        ]
          .map(text)
          .join('\n'),
      };
    }
  );
  return {
    observed: Boolean(
      language && one('.resume__position') && one('.resume__title')
    ),
    language,
    name: one('.resume__title'),
    title: one('.resume__position'),
    skills: [...(skills?.querySelectorAll('.resume-skils__item span') ?? [])]
      .map((node) => text(node).replace(/;$/u, '').trim())
      .filter(Boolean),
    about: text(about),
    jobs,
  };
};
