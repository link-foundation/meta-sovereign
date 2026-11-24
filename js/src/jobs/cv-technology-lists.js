import { technologyFailure } from './technology-catalog.js';

export const technologyCategories = {
  platforms: ['Platforms', 'Платформы'],
  languages: ['Languages', 'Языки'],
  tools: ['Tools', 'Инструменты'],
  methods: ['Methods', 'Методологии', 'Methodologies'],
  technologies: ['Technologies', 'Технологии'],
  databases: ['Databases', 'Базы данных'],
};
const key = (value) => value.normalize('NFKC').toLowerCase().trim();
const aboutHeading = /^(?:technical skills|технические навыки):?$/iu;
const personalHeading = /^(?:personal|личные)\s*:/iu;
const aliasHeading =
  /^(?:technology aliases|technology name variants|технологии\s*[—–-]\s*варианты названий)\s*:/iu;
const jobHeading =
  /^(?:technologies(?: and tools)?|tools|skills(?: used|, technologies(?:,? and tools)?)?|tech(?:nology)? stack|используемые технологии|использовавшиеся навыки|навыки, технологии и инструменты|технологии|стек(?: технологий)?)\s*:\s*(.*)$/iu;
// Unlabelled sentences are narrative, never material to silently move into a list.
const listLine = (text) =>
  !/[!?]|[.。]\s*$/u.test(text.trim()) &&
  splitTechnologyList(text).every(
    (term) => term.length <= 500 && term.split(/\s+/u).length <= 8
  );

/** Retain raw terms and offsets; separators inside parentheses stay inside a term. */
export const splitTechnologyList = (text) => {
  let start = 0;
  let depth = 0;
  const terms = [];
  for (let index = 0; index <= text.length; index++) {
    const char = text[index];
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
    }
    if (depth < 0 || depth > 4) {
      throw technologyFailure('list');
    }
    if (index === text.length || (depth === 0 && /[,;\n]/u.test(char))) {
      const raw = text.slice(start, index).trim();
      if (raw) {
        terms.push(raw);
      }
      start = index + 1;
    }
  }
  if (depth || terms.length > 1000) {
    throw technologyFailure('list');
  }
  return terms;
};
const lines = (text) => {
  const result = [];
  let start = 0;
  for (const value of text.split('\n')) {
    result.push({ value, start, end: start + value.length });
    start += value.length + 1;
  }
  return result;
};
const category = (line) => {
  const match = line.match(/^([^:]+):\s*(.*)$/u);
  if (!match) {
    return null;
  }
  const id = Object.keys(technologyCategories).find((name) =>
    technologyCategories[name].some((label) => key(label) === key(match[1]))
  );
  return id ? { id, rest: match[2] } : null;
};
const legacyLine = (result, row) => {
  result.legacyAliases.push(row.value);
  if (row.value.trim() && !listLine(row.value)) {
    result.blockers.push({ code: 'about-layout', raw: row.value });
  } else {
    result.legacyTerms.push(...splitTechnologyList(row.value));
  }
};
export const aboutTechnologyInventory = (text) => {
  const rows = lines(text);
  const start = rows.findIndex((row) => aboutHeading.test(row.value.trim()));
  const result = {
    raw: text,
    prefix: text,
    personal: '',
    categories: [],
    legacyAliases: [],
    legacyTerms: [],
    blockers: [],
  };
  if (start < 0) {
    return result;
  }
  result.prefix = text.slice(0, rows[start].start);
  let active = null;
  for (const row of rows.slice(start + 1)) {
    const plain = row.value.trim();
    if (personalHeading.test(plain)) {
      active = 'personal';
      result.personal += row.value;
    } else if (aliasHeading.test(plain)) {
      active = 'aliases';
      result.legacyAliases.push(row.value);
      result.legacyTerms.push(
        ...splitTechnologyList(row.value.slice(row.value.indexOf(':') + 1))
      );
    } else if (active === 'personal') {
      result.personal += `\n${row.value}`;
    } else if (active === 'aliases') {
      legacyLine(result, row);
    } else if (category(plain)) {
      const item = category(plain);
      active = { category: item.id, terms: [] };
      result.categories.push(active);
      active.terms.push(...splitTechnologyList(item.rest));
      if (!listLine(item.rest)) {
        result.blockers.push({ code: 'about-layout', raw: row.value });
      }
    } else if (
      active &&
      plain &&
      !/^[^:,]+:\s*$/u.test(plain) &&
      listLine(row.value)
    ) {
      active.terms.push(...splitTechnologyList(row.value));
    } else if (plain) {
      result.blockers.push({ code: 'about-layout', raw: row.value });
      active = null;
    } else {
      active = null;
    }
  }
  return result;
};

export const jobTechnologyInventory = (text) => {
  const rows = lines(text);
  const blocks = [];
  for (let index = 0; index < rows.length; index++) {
    const first = rows[index];
    const match = first.value.trim().match(jobHeading);
    if (!match) {
      continue;
    }
    const block = {
      start: first.start,
      end: first.end,
      heading: first.value.split(':')[0],
      terms: splitTechnologyList(match[1]),
    };
    while (index + 1 < rows.length) {
      const next = rows[index + 1];
      if (!next.value.trim() && !block.terms.length) {
        block.end = next.end;
        index++;
        continue;
      }
      if (
        !next.value.trim() ||
        /:\s*$/u.test(next.value.trim()) ||
        jobHeading.test(next.value.trim()) ||
        !listLine(next.value)
      ) {
        break;
      }
      block.terms.push(...splitTechnologyList(next.value));
      block.end = next.end;
      index++;
    }
    blocks.push(block);
  }
  return { raw: text, blocks, terms: blocks.flatMap((block) => block.terms) };
};

export const renderAboutTechnologies = (inventory, categories, language) => {
  const parts = [language === 'ru' ? 'Технические навыки' : 'Technical Skills'];
  for (const [id, terms] of Object.entries(categories)) {
    if (terms.length) {
      parts.push(
        `${technologyCategories[id][language === 'ru' ? 1 : 0]}:\n${terms.join(', ')}`
      );
    }
  }
  // Narrative and personal text travel verbatim, including their internal newlines.
  const prefix = inventory.prefix;
  return `${prefix}${prefix && !prefix.endsWith('\n\n') ? '\n\n' : ''}${parts.join('\n')}${inventory.personal ? `\n${inventory.personal}` : ''}`;
};
export const renderJobTechnologies = (inventory, terms, language) => {
  if (!inventory.blocks.length) {
    return `${inventory.raw}${inventory.raw ? '\n\n' : ''}${language === 'ru' ? 'Используемые технологии' : 'Technologies and tools'}:\n${terms.join(', ')}`;
  }
  let result = inventory.raw;
  for (let index = inventory.blocks.length - 1; index >= 0; index--) {
    const block = inventory.blocks[index];
    const replacement = index ? '' : `${block.heading}:\n${terms.join(', ')}`;
    result =
      result.slice(0, block.start) + replacement + result.slice(block.end);
  }
  return result;
};
