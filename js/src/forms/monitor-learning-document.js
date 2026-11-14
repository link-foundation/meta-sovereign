/** Passive submission/edit evidence; never initiates or prevents an action. */
export const observeFormLearning = () => {
  const doc = globalThis.document;
  let edits = 0;
  let editedAt = 0;
  let intent = 0;
  let priorConfirmation = false;
  let nativeGesture = null;
  const changed = new WeakMap();
  const selector =
    'input,textarea,select,[role="textbox"],[role="combobox"],[role="checkbox"],[role="radio"],[role="listbox"],[contenteditable="true"]';
  const edited = (event) => {
    if (!event.isTrusted) {
      return;
    }
    const node = event.target?.closest?.(selector);
    if (node) {
      edits++;
      editedAt = Date.now();
      changed.set(node, editedAt);
    }
  };
  const confirmation = () => {
    const text = (doc.body?.innerText ?? '').slice(0, 50000);
    return /your (?:response|answers?) (?:has|have) been (?:recorded|submitted)|response (?:recorded|submitted)|ваш(?:и)? ответ(?:ы)? (?:записан|отправлен|принят)|ответы успешно отправлены|câu trả lời của bạn đã được ghi lại|您的回答已|已提交|आपका (?:जवाब|उत्तर) (?:दर्ज|सबमिट)|réponse a été enregistrée/iu.test(
      text
    );
  };
  const submitterName = (node) =>
    (
      node?.getAttribute?.('aria-label') ||
      node?.value ||
      node?.textContent ||
      ''
    )
      .trim()
      .slice(0, 2000);
  const isNext = (name) =>
    /^(?:next(?: page)?|continue|далее|следующая(?: страница)?|下一页|继续|अगला(?: पृष्ठ)?|tiếp theo|suivant|weiter)\s*[→›»]?$/iu.test(
      name
    );
  const attempt = () => {
    intent++;
    priorConfirmation = confirmation();
  };
  for (const name of ['input', 'change']) {
    doc.addEventListener(name, edited, { capture: true, passive: true });
  }
  doc.addEventListener(
    'keydown',
    (event) => {
      if (
        event.isTrusted &&
        event.key === 'Enter' &&
        event.target?.closest?.('input,select')
      ) {
        nativeGesture = Date.now();
      }
    },
    { capture: true, passive: true }
  );
  doc.addEventListener(
    'submit',
    (event) => {
      // requestSubmit() also creates a trusted SubmitEvent. Require the
      // preceding owner click/Enter, rather than trusting that event alone.
      if (
        event.isTrusted &&
        nativeGesture !== null &&
        Date.now() - nativeGesture <= 1500 &&
        !isNext(submitterName(event.submitter))
      ) {
        attempt();
      }
      nativeGesture = null;
    },
    { capture: true, passive: true }
  );
  doc.addEventListener(
    'click',
    (event) => {
      if (
        event.target?.closest?.(
          '[role="checkbox"],[role="radio"],[role="option"]'
        )
      ) {
        edited(event);
      }
      const node = event.target?.closest?.(
        'button,[role="button"],input[type="submit"]'
      );
      if (
        event.isTrusted &&
        node?.type === 'submit' &&
        !isNext(submitterName(node))
      ) {
        nativeGesture = Date.now();
      }
      if (
        event.isTrusted &&
        /^(?:send|submit(?: (?:form|response|answers?))?|отправить(?: ответ(?:ы)?)?|gửi|提交|发送|भेजें|सबमिट|envoyer|senden)\s*[→›»]?$/iu.test(
          submitterName(node)
        )
      ) {
        attempt();
        nativeGesture = null;
      }
    },
    { capture: true, passive: true }
  );
  return {
    read(snapshot) {
      const changes = [];
      const fields = new Set(
        snapshot?.fields.map((field) => field.index) ?? []
      );
      let index = 0;
      for (const node of doc.querySelectorAll(selector)) {
        if (index >= 2000) {
          break;
        }
        if (fields.has(index) && changed.has(node)) {
          changes.push({ index, at: changed.get(node) });
        }
        index++;
      }
      return {
        edits,
        editedAt,
        changes,
        intent,
        at: Date.now(),
        confirmation: confirmation() && (!intent || !priorConfirmation),
        responseUrl:
          /^https:\/\/docs\.google\.com\/forms\/[^?#]*\/formResponse(?:[?#]|$)/u.test(
            doc.location.href
          ),
      };
    },
  };
};
