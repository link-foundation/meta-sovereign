/** Only employer-authored text participates; answers and CV titles never do. */
const clearlyEnglish = (text) => {
  const letters = text.match(/\p{L}/gu) ?? [];
  return (
    letters.length >= 20 &&
    letters.filter((letter) => /[a-z]/iu.test(letter)).length /
      letters.length >=
      0.9
  );
};
const textLanguage = (text) =>
  clearlyEnglish(text) ? 'en' : /[а-яё]/iu.test(text) ? 'ru' : null;
const dollarPay = (text) => {
  // Do not mistake shell variables, templates or command substitutions for pay.
  const employer = text.replace(
    /\$[\p{L}_][\p{L}\p{N}_]*|\$\{[^}\n]*(?:\}|$)|\$\([^\n)]*(?:\)|$)/gmu,
    ''
  );
  return (
    /\bUSD(?:T|C)?\b|\bdollars?\b|доллар|\$\s*\d|\d\s*\$/iu.test(employer) ||
    (/salary|compensation|remuneration|\bpay\b|\brate\b|зарплат|заработ|компенсаци|вознагражд|доход|оклад|ставк|оплат|сумм/iu.test(
      employer
    ) &&
      /(?<![\p{L}\p{N}_])\$(?![\p{L}\p{N}_({])/u.test(employer))
  );
};

export const resumeContextDecision = ({
  questions = [],
  vacancy = {},
} = {}) => {
  const questionText = questions.join('\n');
  const description = vacancy.description ?? '';
  if (dollarPay([questionText, vacancy.salary ?? '', description].join('\n'))) {
    return { language: 'en', reason: 'dollar-pay' };
  }
  for (const [reason, text] of [
    ['questions', questionText],
    ['description', description],
    ['title', vacancy.title ?? ''],
  ]) {
    const language = textLanguage(text);
    if (language) {
      return { language, reason };
    }
  }
  return { language: null, reason: 'unknown' };
};

// The known native chooser may expose unlabelled CV radios. They are not questions.
const contextCoverage = (report, page) =>
  report?.coverage === 'inspected' ||
  (report?.coverage === 'partial' &&
    page.resumeChooser?.open &&
    !page.resumeChooser.ambiguous &&
    page.resumeIndices?.length > 0 &&
    report.frames?.length > 0 &&
    report.frames.every((frame) =>
      frame.reasons.every((reason) => reason === 'unlabelled-controls')
    ) &&
    report.fields.every(
      (field) =>
        field.label.trim() ||
        (field.frame === 'frame-1' &&
          field.type === 'radio' &&
          page.resumeIndices.includes(field.index))
    ));

const completeQuestions = (report, page, fields) =>
  page.questionIndices?.length > 0 &&
  contextCoverage(report, page) &&
  !report.navigation.limited &&
  !report.navigation.nextPage &&
  !report.omissions?.length &&
  fields.length === page.questionIndices.length &&
  fields.every((field) => field.label.trim());

/** Incomplete question coverage cannot authorize a contextual choice. */
export const applicationResumeContext = (record) => {
  const { report, page, vacancy } = record;
  if (!page?.bound || !vacancy || vacancy.salary === null) {
    return { language: null, reason: 'unreadable' };
  }
  let questions = [];
  if (page.questions) {
    const indices = page.questionIndices;
    const fields = report?.fields.filter(
      (field) => field.frame === 'frame-1' && indices?.includes(field.index)
    );
    if (!completeQuestions(report, page, fields)) {
      return { language: null, reason: 'unreadable' };
    }
    questions = fields.flatMap((field) => [
      field.group?.label ?? '',
      field.label,
      field.description,
    ]);
  }
  return resumeContextDecision({ questions, vacancy });
};
