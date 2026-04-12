const DISALLOWED_PATTERNS = [
  /\b(kill yourself|kys)\b/i,
  /\b(rape|rapist)\b/i,
  /\b(nigger|nigga|faggot|fag|kike|spic)\b/i,
];

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeUserGeneratedText(value: string): string {
  return collapseWhitespace(value);
}

export function moderateUserGeneratedText(
  value: string,
  options: { fieldLabel?: string } = {},
): string {
  const normalized = normalizeUserGeneratedText(value);
  if (!normalized) return '';

  for (const pattern of DISALLOWED_PATTERNS) {
    if (pattern.test(normalized)) {
      const field = options.fieldLabel ?? 'message';
      throw new Error(`This ${field} contains language that is not allowed.`);
    }
  }

  return normalized;
}
