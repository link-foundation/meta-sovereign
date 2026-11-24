// Stable existing knowledge identifiers, shared by observed and saved pairs.
export const answerKeyHash = (text) => {
  let result = 14695981039346656037n;
  for (const char of text) {
    result = BigInt.asUintN(
      64,
      (result ^ BigInt(char.codePointAt(0))) * 1099511628211n
    );
  }
  return result.toString(36);
};
