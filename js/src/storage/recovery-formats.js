// Startup validates format names without loading archive streams or codecs.
export const RECOVERY_FORMATS = Object.freeze(['text', 'binary']);

export const recoveryFormats = (value = RECOVERY_FORMATS) => {
  if (value === 'none') {
    return [];
  }
  const list = Array.isArray(value) ? value : String(value).split(',');
  if (!list.every((format) => RECOVERY_FORMATS.includes(format))) {
    throw Object.assign(
      new Error('recovery formats must be text, binary, or text,binary'),
      { code: 'BACKUP_FORMAT' }
    );
  }
  return [...new Set(list)];
};
