// Only known transient npm failures merit another upload attempt.
export function publishFailureKind(output) {
  const text = String(output);
  if (/cannot publish over previously staged version/i.test(text)) {
    return 'staged';
  }
  if (
    /\bE(?:401|403|404|OTP|NEEDAUTH)\b|npm error (?:401|403|404)|access token expired|unable to authenticate|repository rule violations|resource not accessible/i.test(
      text
    )
  ) {
    return 'permanent';
  }
  if (
    /\b(?:EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|E429|E5\d\d)\b|(?:HTTP|npm error)\s+(?:429|5\d\d)\b/i.test(
      text
    )
  ) {
    return 'transient';
  }
  return 'unknown';
}
