// Parse a quoted JSON document so special keys keep JSON semantics. Escape
// script delimiters and line separators even when embedded in an HTML script.
export const mcpFixtureLiteral = (fixture) => {
  const json = JSON.stringify(fixture);
  if (json === undefined) {
    return 'undefined';
  }
  const data = JSON.stringify(json).replace(
    /[<>\u2028\u2029]/gu,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
  return `JSON.parse(${data})`;
};

// The callback is trusted repository source; fixture data never becomes code.
export const mcpInspectionCode = (inspect, fixture, check) => {
  const callback = check ? `, (${check.toString()})` : '';
  return `async (page) => (${inspect.toString()})(page, ${mcpFixtureLiteral(fixture)}${callback})`;
};
