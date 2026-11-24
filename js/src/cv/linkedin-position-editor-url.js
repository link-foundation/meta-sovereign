const positionPath =
  /^(?:edit\/forms\/position|add-edit\/POSITION)\/(?:(?<id>[\w.%,:()-]{1,200})\/?)?$/u;
const editLabel = /^(?:edit|изменить|редактировать)(?:\s|$)/iu;
const addLabel = /^(?:add (?:a )?position|добавить должность)$/iu;

const hasObservedPositionRoute = (editor, prefix, operation) => {
  const match = positionPath.exec(editor.pathname.slice(prefix.length));
  if (!match) {
    return false;
  }
  const id = decodeURIComponent(match.groups.id ?? '');
  return operation === 'add'
    ? id === '' || id === 'new'
    : id !== 'new' && /^[\w:(),.-]{1,200}$/u.test(id);
};

/** Verify that an observed editor belongs to the exact captured profile. */
export const linkedinPositionEditorUrl = (href, experienceUrl, operation) => {
  if (
    typeof href !== 'string' ||
    href.length > 2000 ||
    !['add', 'update'].includes(operation)
  ) {
    return null;
  }
  try {
    const profile = new URL(experienceUrl);
    const prefix = profile.pathname.replace(/details\/experience\/$/u, '');
    const editor = new URL(href);
    if (
      profile.origin !== 'https://www.linkedin.com' ||
      prefix === profile.pathname ||
      editor.origin !== profile.origin ||
      editor.username ||
      editor.password ||
      editor.hash ||
      !editor.pathname.startsWith(prefix) ||
      !hasObservedPositionRoute(editor, prefix, operation) ||
      editor.searchParams.size > 1 ||
      [...editor.searchParams].some(
        ([key, value]) =>
          key !== 'profileFormEntryPoint' || !/^[A-Z_]{1,60}$/u.test(value)
      )
    ) {
      return null;
    }
    return editor.href;
  } catch {
    return null;
  }
};

export const observedLinkedinPositionEditor = (
  links,
  experienceUrl,
  operation
) => {
  if (!Array.isArray(links) || links.length > 20) {
    return null;
  }
  const label = operation === 'add' ? addLabel : editLabel;
  const matches = links.filter(
    (link) => typeof link?.label === 'string' && label.test(link.label.trim())
  );
  return matches.length === 1
    ? linkedinPositionEditorUrl(matches[0].href, experienceUrl, operation)
    : null;
};
