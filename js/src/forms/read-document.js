/** Runs inside one browser document. Keep self-contained for commander.evaluate.
 * Helpers stay inside this serializable boundary; each handles one DOM concern.
 */
/* eslint-disable max-lines-per-function -- The page evaluator must serialize its DOM helpers together. */
export const readFormDocument = ({
  maxFields = 200,
  maxOptions = 100,
  identityOnly = false,
  challengeOnly = false,
  hhLimit = null,
  assignmentSectionPatterns,
} = {}) => {
  const doc = globalThis.document;
  // WebKit timeOrigin can drift within one live document. Bind to a private,
  // immutable per-document nonce, shared by inspection and passive capture.
  const key = Symbol.for('meta-sovereign.forms.document-key.v1');
  if (!Object.hasOwn(doc, key)) {
    Object.defineProperty(doc, key, {
      value: globalThis.crypto.getRandomValues(new Uint32Array(4)).join('-'),
    });
  }
  const identity = { url: doc.location.href, documentKey: doc[key] };
  if (identityOnly) {
    return identity;
  }
  const visible = (node) => {
    if (node.closest('[hidden], [inert], [aria-hidden="true"]')) {
      return false;
    }
    const style = globalThis.getComputedStyle(node);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.visibility !== 'collapse' &&
      node.getClientRects().length > 0
    );
  };
  // Detect only challenge boundaries and completion booleans. Never extract a
  // challenge's instructions, answers, images or response token into a report.
  const challengeRoots =
    '.smart-captcha,[data-smartcaptcha],#captcha-form,form[action*="checkcaptcha"],.CheckboxCaptcha,.TextinputCaptcha,.g-recaptcha,.h-captcha,.cf-turnstile';
  // HH's text gate is independent of another widget's completion token.
  const nativeChallenge = Array.from(
    doc.querySelectorAll(
      'input[data-qa="account-captcha-input"],input[name="captchaText"]'
    )
  ).some(visible);
  const challengeUrl = (value) => {
    if (!globalThis.URL) {
      return false;
    }
    const { hostname, pathname } = new globalThis.URL(value, identity.url);
    return (
      hostname === 'smartcaptcha.yandexcloud.net' ||
      /(^|\.)captcha\.yandex\.net$/u.test(hostname) ||
      /(^|\.)(hcaptcha\.com|recaptcha\.net)$/u.test(hostname) ||
      hostname === 'challenges.cloudflare.com' ||
      (/^\/(showcaptcha|checkcaptcha)(\/|$)/u.test(pathname) &&
        /(^|\.)yandex\.(ru|com)$/u.test(hostname)) ||
      (/(^|\.)google\.com$/u.test(hostname) &&
        pathname.startsWith('/recaptcha/'))
    );
  };
  const responses = Array.from(
    doc.querySelectorAll(
      '[name="smart-token"],[name="g-recaptcha-response"],[name="h-captcha-response"],[name="cf-turnstile-response"]'
    )
  ).slice(0, 21);
  const completedResponse = () =>
    !nativeChallenge &&
    responses.length > 0 &&
    responses.length <= 20 &&
    responses.every((node) => Boolean(node.value));
  const challengePresent = () =>
    nativeChallenge ||
    challengeUrl(identity.url) ||
    (!completedResponse() &&
      (Array.from(doc.querySelectorAll(challengeRoots)).some(visible) ||
        Array.from(doc.querySelectorAll('iframe')).some(
          (node) =>
            visible(node) && challengeUrl(node.getAttribute('src') || '')
        )));
  const challenge = challengePresent();
  if (challengeOnly) {
    return { challenge };
  }
  const root = limitForm();
  if ((challenge && !hhLimit) || !root) {
    return {
      ...identity,
      title: '',
      intro: '',
      fields: [],
      excluded: 0,
      reasons: ['owner-verification'],
      challenge: { active: true, kind: 'captcha' },
      scope: 'visible-current-document',
      navigation: { nextPage: false, limited: true },
    };
  }
  function limitForm() {
    if (!hhLimit) {
      return doc;
    }
    const expected = new URL(hhLimit.url);
    const current = new URL(identity.url);
    const documentKey =
      doc[Symbol.for('meta-sovereign.jobs.application-document.v1')];
    const submits = [
      ...doc.querySelectorAll(
        '[data-qa="vacancy-response-submit-popup"],[data-qa="vacancy-response-letter-submit"],[data-qa="vacancy-response-link-no-questions"]'
      ),
    ].filter(visible);
    const form = submits.length === 1 ? submits[0].form : null;
    const challenges = [
      ...doc.querySelectorAll(
        'input[data-qa="account-captcha-input"],input[name="captchaText"]'
      ),
    ].filter(visible);
    const sameLocation = () =>
      expected.origin === 'https://hh.ru' &&
      current.origin === expected.origin &&
      !current.username &&
      !current.password &&
      (current.pathname === expected.pathname ||
        (current.pathname === '/applicant/vacancy_response' &&
          current.searchParams.getAll('vacancyId').length === 1 &&
          current.searchParams.get('vacancyId') ===
            expected.pathname.split('/').at(-1)));
    return sameLocation() &&
      documentKey === hhLimit.documentKey &&
      nativeChallenge &&
      form &&
      visible(form) &&
      challenges.every(
        (node) =>
          !form.contains(node) &&
          !node.closest('[role="dialog"]')?.contains(form)
      ) &&
      !form.matches(challengeRoots) &&
      ![...form.elements].some((node) => !form.contains(node)) &&
      !form.querySelector(
        `${challengeRoots},[data-qa="captcha"],input[name*="captcha"],input[data-qa="account-captcha-input"],iframe,input[type="password"],input[type="file"]`
      )
      ? form
      : null;
  }
  function readAssignmentSections() {
    const region = 'section,article,fieldset,[role="listitem"]';
    const excluded = `${challengeRoots},script,style,noscript,input,textarea,select,button,label,output,[contenteditable],[role="textbox"],[role="combobox"]`;
    const marker = new RegExp(assignmentSectionPatterns.marker, 'iu');
    const waived = new RegExp(assignmentSectionPatterns.waived, 'iu');
    const instructions = new RegExp(
      assignmentSectionPatterns.instructions,
      'iu'
    );
    const taskHeading = (value) => marker.test(value) && !waived.test(value);
    const textParent = (node) => {
      const parent = node.parentElement;
      return node.nodeType === 3 &&
        parent &&
        !parent.closest(excluded) &&
        visible(parent)
        ? parent
        : null;
    };
    const sections = [];
    const instructionLinks = new Set();
    const documentUrl = new globalThis.URL(identity.url);
    documentUrl.hash = '';
    const instructionUrl = (anchor, label) => {
      if (!instructions.test(label)) {
        return null;
      }
      try {
        const url = new globalThis.URL(anchor.href);
        url.hash = '';
        return ['http:', 'https:'].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          url.href.length <= 4000 &&
          url.href !== documentUrl.href
          ? url.href
          : null;
      } catch {
        return null;
      }
    };
    const rememberAnchorLabel = (section, anchorLabels, parent, value) => {
      const anchor = parent.closest('a[href]');
      if (anchor && section.contains(anchor)) {
        anchorLabels.set(
          anchor,
          `${anchorLabels.get(anchor) ?? ''} ${value}`.trim().slice(0, 500)
        );
      }
    };
    const addInstructionLinks = (anchorLabels) => {
      for (const [anchor, label] of anchorLabels) {
        const url = instructionUrl(anchor, label);
        if (url) {
          instructionLinks.add(url);
          if (instructionLinks.size > 8) {
            return false;
          }
        }
      }
      return true;
    };
    let remainingNodes = 12000;
    let remainingText = 30000;
    let limited = false;
    let taskLimited = false;
    const readSection = (section) => {
      const walker = doc.createTreeWalker(section);
      const chunks = [];
      const anchorLabels = new Map();
      let length = 0;
      const heading = () => chunks.slice(0, 2).join(' ');
      const exceed = (prefix) => {
        limited = true;
        taskLimited = taskHeading(prefix);
        return '';
      };
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (--remainingNodes < 0) {
          return exceed(heading());
        }
        const parent = textParent(node);
        if (!parent) {
          continue;
        }
        if (node.length > 30000) {
          return exceed(
            chunks.length < 2
              ? `${heading()} ${node.data.slice(0, 500)}`
              : heading()
          );
        }
        const value = node.data.replace(/\s+/gu, ' ').trim();
        if (!value) {
          continue;
        }
        if (!chunks.length && parent.closest(region) !== section) {
          return '';
        }
        chunks.push(value);
        if (chunks.length === 2 && !taskHeading(heading())) {
          return '';
        }
        rememberAnchorLabel(section, anchorLabels, parent, value);
        length += value.length + (chunks.length > 1 ? 1 : 0);
        if (length > remainingText) {
          return exceed(heading());
        }
      }
      if (!taskHeading(heading())) {
        return '';
      }
      if (!addInstructionLinks(anchorLabels)) {
        return exceed(heading());
      }
      return chunks.join('\n');
    };
    let inspected = 0;
    for (const section of root.querySelectorAll(region)) {
      if (++inspected > 500 || limited) {
        limited = true;
        break;
      }
      if (!visible(section) || section.closest(excluded)) {
        continue;
      }
      const text = readSection(section);
      if (text && !sections.includes(text)) {
        if (sections.length === 8) {
          limited = true;
          break;
        }
        remainingText -= text.length + 1;
        sections.push(text);
      }
    }
    return {
      limited,
      sections,
      instructionLinks: instructionLinks.size <= 8 ? [...instructionLinks] : [],
      taskLimited: taskLimited || (limited && sections.length > 0),
    };
  }
  function readAssignmentEvidence(reasons) {
    if (hhLimit || !assignmentSectionPatterns) {
      return {};
    }
    const { sections, instructionLinks, limited, taskLimited } =
      readAssignmentSections();
    if (limited) {
      reasons.add('assignment-section-limit');
    }
    return {
      ...(sections.length ? { assignmentSections: sections } : {}),
      ...(instructionLinks.length
        ? { assignmentInstructionLinks: instructionLinks }
        : {}),
      ...(taskLimited ? { assignmentSectionsLimited: true } : {}),
    };
  }
  const readFields = () => {
    const reasons = new Set();
    const groups = new Map();
    const within = (node) => !hhLimit || Boolean(node && root.contains(node));
    const reference = (id) => {
      const node = doc.getElementById(id);
      if (node && !within(node)) {
        reasons.add('external-form-reference');
        return null;
      }
      return node;
    };
    // Native exclusivity follows form owner and exact name, across fieldsets.
    // Include hidden/disabled peers in the count so a partial group cannot fill.
    const collectRadios = () => {
      const owners = new Map();
      const membership = new Map();
      let count = 0;
      let complete = true;
      for (const node of root.querySelectorAll('input[type="radio"]')) {
        if (++count > 2000) {
          complete = false;
          reasons.add('control-scan-limit');
          break;
        }
        if (!owners.has(node.form)) {
          owners.set(node.form, new Map());
        }
        const named = owners.get(node.form);
        const key = node.name || node;
        if (!named.has(key)) {
          named.set(key, { id: `radio-group-${count}`, size: 0 });
        }
        const group = named.get(key);
        group.size++;
        membership.set(node, group);
      }
      return { membership, complete };
    };
    const radios = collectRadios();
    const collectAriaRadios = () => {
      const membership = new Map();
      const owners = new Map();
      let count = 0;
      for (const node of root.querySelectorAll('[role="radio"]')) {
        if (++count > 2000) {
          reasons.add('control-scan-limit');
          break;
        }
        const owner = node.parentElement?.closest('[role="radiogroup"]');
        if (!owner || node.matches('input') || node.querySelector('input')) {
          continue;
        }
        if (!owners.has(owner)) {
          owners.set(owner, {
            id: `aria-radio-group-${count}`,
            size: 0,
            complete: !owner.hasAttribute('aria-owns'),
          });
        }
        const group = owners.get(owner);
        group.size++;
        membership.set(node, group);
      }
      if (count > 2000) {
        for (const group of owners.values()) {
          group.complete = false;
        }
      }
      return membership;
    };
    const ariaRadios = collectAriaRadios();
    const clip = (value, multiline = false) => {
      const text = String(value ?? '')
        .replace(/\r\n?/gu, '\n')
        .replace(multiline ? /[^\S\n]+/gu : /\s+/gu, ' ')
        .trim();
      if (text.length > 2000) {
        reasons.add('text-limit');
      }
      return text.slice(0, 2000);
    };
    const attr = (node, key) => node.getAttribute(key) ?? '';
    const refs = (node, key, multiline = false) =>
      clip(
        attr(node, key)
          .split(/\s+/u)
          .slice(0, 20)
          .map((id) => reference(id)?.textContent ?? '')
          .join(' '),
        multiline
      );
    const labelText = (label) => {
      const filter = globalThis.NodeFilter;
      const walker = doc.createTreeWalker(
        label,
        filter.SHOW_ELEMENT | filter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            if (node.nodeType === 1) {
              return node.matches('input,textarea,select,button')
                ? filter.FILTER_REJECT
                : node.matches('br,p,div,li,ol,ul')
                  ? filter.FILTER_ACCEPT
                  : filter.FILTER_SKIP;
            }
            return filter.FILTER_ACCEPT;
          },
        }
      );
      let text = '';
      for (let step = 0; step < 100; step++) {
        const next = walker.nextNode();
        if (!next) {
          return text;
        }
        // Keep authored question boundaries without reading control values.
        text +=
          next.nodeType === 1
            ? '\n'
            : `${text.endsWith('\n') ? '' : ' '}${next.textContent}`;
        if (text.length > 2000) {
          break;
        }
      }
      reasons.add('text-limit');
      return text;
    };
    const named = (node) => {
      const candidates = [
        ['aria-labelledby', refs(node, 'aria-labelledby', true)],
        ['aria-label', attr(node, 'aria-label')],
        [
          'label',
          Array.from(node.labels ?? [])
            .slice(0, 20)
            .filter((label) => {
              if (!within(label)) {
                reasons.add('external-form-reference');
                return false;
              }
              return true;
            })
            .map(labelText)
            .join(' '),
        ],
      ];
      const hit = candidates.find(([, value]) => clip(value));
      return hit ? { text: clip(hit[1], true), source: hit[0] } : null;
    };
    const heading = (node) => {
      // Stay within the closest question/section; a heading below a control is
      // not evidence for its question. Bound ancestor and sibling traversal.
      let current = node;
      for (
        let depth = 0;
        current && within(current) && depth < 6;
        depth++, current = current.parentElement
      ) {
        if (hhLimit && current === root) {
          break;
        }
        let sibling = current.previousElementSibling;
        for (
          let step = 0;
          sibling && step < 20;
          step++, sibling = sibling.previousElementSibling
        ) {
          const headings = sibling.matches('h1,h2,h3,h4,h5,h6,[role="heading"]')
            ? [sibling]
            : sibling.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]');
          const found = Array.from(headings).filter(visible).at(-1);
          if (found) {
            return clip(found.textContent, true);
          }
        }
        if (
          current.matches(
            'fieldset,[role="group"],[role="radiogroup"],section,form'
          )
        ) {
          break;
        }
      }
      return '';
    };
    const groupOf = (node) => {
      const parent = node.parentElement?.closest(
        'fieldset,[role="group"],[role="radiogroup"]'
      );
      if (!parent || !within(parent)) {
        return null;
      }
      const name = named(parent);
      const legend = Array.from(parent.children).find(
        (child) => child.tagName === 'LEGEND'
      );
      if (!groups.has(parent)) {
        groups.set(parent, `group-${groups.size + 1}`);
      }
      return {
        id: groups.get(parent),
        label: name?.text || clip(legend?.textContent, true),
        source: name?.source || (legend ? 'legend' : 'unlabelled'),
      };
    };
    const optionsOf = (node, type) => {
      if (!(
        node.tagName === 'SELECT' || ['listbox', 'combobox'].includes(type)
      )) {
        return { options: [] };
      }
      const references = attr(node, 'aria-controls')
        .split(/\s+/u)
        .filter(Boolean);
      const owned = references.slice(0, 10).map(reference).filter(Boolean);
      const choices = new Set([
        ...node.querySelectorAll('option,[role="option"]'),
        ...owned.flatMap((owner) =>
          Array.from(owner.querySelectorAll('[role="option"]'))
        ),
      ]);
      const options = [];
      for (const option of choices) {
        if (options.length >= maxOptions) {
          reasons.add('option-limit');
          break;
        }
        const custom = node.tagName !== 'SELECT';
        options.push({
          label: clip(option.label || option.textContent),
          value: clip(
            option.value ?? (attr(option, 'data-value') || option.textContent)
          ),
          selected:
            option.selected === true ||
            attr(option, 'aria-selected') === 'true',
          disabled:
            option.matches(':disabled') ||
            Boolean(option.closest('[aria-disabled="true"]')),
          ...(custom
            ? {
                index: Array.from(
                  doc.querySelectorAll('[role="option"]')
                ).indexOf(option),
                visible: visible(option),
                clickable: !option.closest(
                  'a[href],button:not([type="button"]),input'
                ),
              }
            : {}),
        });
      }
      if (type === 'combobox' && options.length === 0) {
        reasons.add('unexpanded-options');
      }
      return {
        options,
        ...(node.tagName !== 'SELECT'
          ? {
              optionsComplete:
                choices.size <= maxOptions &&
                references.length === owned.length,
            }
          : {}),
      };
    };
    const checkedOf = (node, type) => {
      if (!['checkbox', 'radio'].includes(type)) {
        return null;
      }
      return node.tagName === 'INPUT'
        ? node.checked
        : attr(node, 'aria-checked') === 'true';
    };
    const stateOf = (node, type) => {
      const sensitive = ['password', 'file'].includes(type);
      const value = sensitive
        ? null
        : String(
            node.value ??
              (node.isContentEditable
                ? node.textContent
                : attr(node, 'aria-valuetext'))
          );
      if (value?.length > 10000) {
        reasons.add('value-limit');
      }
      return {
        required:
          node.required === true || attr(node, 'aria-required') === 'true',
        disabled:
          node.matches(':disabled') ||
          Boolean(node.closest('[aria-disabled="true"]')),
        readOnly:
          node.readOnly === true ||
          Boolean(node.closest('[aria-readonly="true"]')),
        value: value?.slice(0, 10000) ?? null,
        checked: checkedOf(node, type),
        valueOmitted: sensitive ? type : null,
        multiple:
          node.multiple === true ||
          attr(node, 'aria-multiselectable') === 'true',
        indeterminate:
          node.indeterminate === true || attr(node, 'aria-checked') === 'mixed',
      };
    };
    const uploadState = (node, type) => {
      if (type !== 'file') {
        return {};
      }
      const list = node.files;
      const files = [];
      for (let index = 0; index < Math.min(list?.length ?? 0, 10); index++) {
        files.push(list[index]);
      }
      return {
        upload: {
          accept: clip(attr(node, 'accept')),
          directory:
            node.hasAttribute('webkitdirectory') ||
            node.hasAttribute('directory'),
          complete: (list?.length ?? 0) <= 10,
          files: files.slice(0, 10).map((file) => ({
            name: file.name.slice(0, 240),
            size: file.size,
            type: file.type.slice(0, 120),
            lastModified: file.lastModified,
          })),
        },
      };
    };
    const readField = (node, type) => {
      const group = groupOf(node);
      const nearbyHeading = heading(node);
      const fallbacks = [
        ['placeholder', attr(node, 'placeholder')],
        ['title', attr(node, 'title')],
        ['legend', group?.source === 'legend' ? group.label : ''],
        ['heading', nearbyHeading],
      ];
      const fallback = fallbacks.find(([, value]) => clip(value));
      const label = named(node) ?? {
        text: clip(fallback?.[1], true),
        source: fallback?.[0] ?? 'unlabelled',
      };
      if (!label.text) {
        reasons.add('unlabelled-controls');
      }
      return {
        tag: node.tagName.toLowerCase(),
        type,
        name: clip(node.name),
        nativeId: clip(node.id),
        label: label.text,
        labelSource: label.source,
        group,
        ...(radios.membership.has(node) || ariaRadios.has(node)
          ? {
              radioGroup: {
                ...(radios.membership.get(node) ?? ariaRadios.get(node)),
                ...(radios.membership.has(node)
                  ? { complete: radios.complete }
                  : {}),
              },
            }
          : {}),
        heading: nearbyHeading,
        description: refs(node, 'aria-describedby'),
        ...stateOf(node, type),
        ...uploadState(node, type),
        ...optionsOf(node, type),
        ...(!['input', 'textarea', 'select'].includes(
          node.tagName.toLowerCase()
        )
          ? {
              custom: {
                editable: node.isContentEditable,
                clickable: !node.closest(
                  'a[href],button:not([type="button"]),input'
                ),
                checkedKnown: ['true', 'false'].includes(
                  attr(node, 'aria-checked')
                ),
              },
            }
          : {}),
      };
    };
    const inputType = (node) =>
      attr(node, 'role') === 'combobox' &&
      ['text', 'search', 'email', 'tel', 'url'].includes(node.type)
        ? 'combobox'
        : String(node.type).toLowerCase();
    const typeOf = (node) =>
      node.tagName === 'INPUT'
        ? inputType(node)
        : attr(node, 'role') ||
          (node.isContentEditable
            ? 'contenteditable'
            : node.tagName.toLowerCase());
    const selector =
      'input,textarea,select,[role="textbox"],[role="combobox"],[role="checkbox"],[role="radio"],[role="listbox"],[contenteditable="true"]';
    const readNavigation = () => {
      const navigation = { nextPage: false, limited: false };
      let buttons = 0;
      for (const node of root.querySelectorAll(
        'button,[role="button"],input[type="button"],input[type="submit"]'
      )) {
        if (++buttons > 200) {
          navigation.limited = true;
          break;
        }
        if (node.closest(challengeRoots)) {
          continue;
        }
        const name = clip(
          attr(node, 'aria-label') || node.value || node.textContent
        );
        if (
          visible(node) &&
          /^(?:next(?: page)?|далее|следующая(?: страница)?|下一页|继续|अगला(?: पृष्ठ)?|tiếp theo|suivant|weiter)\s*[→›»]?$/iu.test(
            name
          )
        ) {
          navigation.nextPage = true;
        }
      }
      return navigation;
    };
    const fields = [];
    const readIntro = () => {
      const first = doc.querySelectorAll(selector)[fields[0]?.index];
      if (!first) {
        return '';
      }
      const boundary =
        first.closest('label,[role="listitem"],fieldset') ?? first;
      const root = first.closest('form,[role="form"]') ?? doc.body;
      const walker = doc.createTreeWalker(
        root,
        globalThis.NodeFilter.SHOW_TEXT
      );
      const chunks = [];
      let length = 0;
      for (let count = 0; count < 1000; count++) {
        const node = walker.nextNode();
        if (
          !node ||
          boundary.contains(node) ||
          !(node.compareDocumentPosition(boundary) & 4)
        ) {
          return chunks.join(' ').trim();
        }
        const parent = node.parentElement;
        if (
          !parent ||
          parent.closest(challengeRoots) ||
          parent.closest(
            'script,style,noscript,button,input,textarea,select'
          ) ||
          !visible(parent)
        ) {
          continue;
        }
        const text = node.textContent.replace(/\s+/gu, ' ').trim();
        if (text) {
          chunks.push(text.slice(0, 6000 - length));
          length += text.length + 1;
        }
        if (length >= 6000) {
          reasons.add('intro-limit');
          return chunks.join(' ').slice(0, 6000);
        }
      }
      reasons.add('intro-limit');
      return chunks.join(' ').slice(0, 6000);
    };
    let examined = 0;
    let excluded = 0;
    const collectControlledLists = () => {
      const controlledLists = new Set();
      for (const combo of root.querySelectorAll(
        '[role="combobox"][aria-controls]'
      )) {
        for (const id of attr(combo, 'aria-controls')
          .split(/\s+/u)
          .slice(0, 10)) {
          controlledLists.add(reference(id));
        }
      }
      return controlledLists;
    };
    const controlledLists = collectControlledLists();
    const wrappedControl = (node, tag) =>
      !['input', 'textarea', 'select'].includes(tag) &&
      node.querySelector('input,textarea,select');
    const selectedValue = (field) => {
      if (field.optionsComplete !== undefined) {
        const selected = field.options.filter((option) => option.selected);
        field.displayValue = field.value;
        field.value = selected.length === 1 ? selected[0].value : '';
      }
      return field;
    };
    const disclosureState = (node, type) =>
      type === 'combobox'
        ? {
            optionsExpanded: ['true', 'false'].includes(
              attr(node, 'aria-expanded')
            )
              ? attr(node, 'aria-expanded') === 'true'
              : null,
            optionsDisclosure:
              attr(node, 'aria-expanded') === 'false' &&
              ['', 'listbox'].includes(attr(node, 'aria-haspopup')) &&
              !node.closest('a[href],button:not([type="button"])') &&
              (!node.closest('input') || node.tagName === 'INPUT'),
          }
        : {};
    for (const node of doc.querySelectorAll(selector)) {
      if (++examined > 2000) {
        reasons.add('control-scan-limit');
        break;
      }
      if (!within(node)) {
        continue;
      }
      const tag = node.tagName.toLowerCase();
      const type = typeOf(node);
      // A controlled popup is part of its combobox whether open or closed.
      if (controlledLists.has(node)) {
        continue;
      }
      if (
        ['hidden', 'submit', 'reset', 'button', 'image'].includes(type) ||
        node.closest(challengeRoots) ||
        !visible(node)
      ) {
        excluded++;
        continue;
      }
      // ARIA wrappers around native inputs are represented by their actual controls.
      if (wrappedControl(node, tag)) {
        continue;
      }
      if (fields.length >= maxFields) {
        reasons.add('field-limit');
        break;
      }
      const field = {
        id: `field-${fields.length + 1}`,
        index: examined - 1,
        ...readField(node, type),
        ...disclosureState(node, type),
      };
      fields.push(selectedValue(field));
    }
    inspectCustomElements();
    function inspectCustomElements() {
      let nodes = 0;
      for (const node of root.querySelectorAll('*')) {
        if (++nodes > 5000) {
          reasons.add('shadow-scan-limit');
          break;
        }
        if (node.shadowRoot || node.tagName.includes('-')) {
          reasons.add('custom-elements');
        }
      }
    }
    const assignment = readAssignmentEvidence(reasons);
    return {
      ...identity,
      title: hhLimit ? '' : clip(doc.title),
      intro: readIntro(),
      ...assignment,
      fields,
      excluded,
      reasons: [...reasons],
      scope: hhLimit ? 'hh-limit-application-form' : 'visible-current-document',
      navigation: readNavigation(),
    };
  };
  return readFields();
};

/* eslint-enable max-lines-per-function */

export const formFrameVisible = (node) => {
  if (node.closest('[hidden],[inert],[aria-hidden="true"]')) {
    return false;
  }
  const style = globalThis.getComputedStyle(node);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    node.getClientRects().length > 0
  );
};
