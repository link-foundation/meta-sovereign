// The callback is trusted source. Fixture values remain escaped data, even
// when the generated inspection is embedded in a script element for review.
export const mcpInspectionCode = (inspect, fixture) => {
  const data = JSON.stringify(fixture).replace(
    /[<>\u2028\u2029]/gu,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
  return `async (page) => (${inspect.toString()})(page, ${data})`;
};
