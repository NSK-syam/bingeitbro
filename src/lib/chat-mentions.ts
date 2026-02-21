export type MentionTarget = {
  id: string;
  name: string;
  username?: string | null;
};

export type MentionQueryState = {
  start: number;
  end: number;
  query: string;
};

export type MentionSegment = {
  text: string;
  mention: boolean;
};

const HANDLE_PATTERN = /[a-zA-Z0-9._-]/;
const TOKEN_BREAK_PATTERN = /[\s]/;

function normalizeHandle(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 32);
}

export function mentionHandle(target: MentionTarget): string {
  const preferred = normalizeHandle(target.username ?? '');
  if (preferred) return preferred;
  const fallback = normalizeHandle(target.name);
  return fallback || 'member';
}

export function getMentionQueryState(text: string, cursorIndex: number): MentionQueryState | null {
  const cursor = Math.max(0, Math.min(cursorIndex, text.length));
  let tokenStart = cursor - 1;
  while (tokenStart >= 0 && !TOKEN_BREAK_PATTERN.test(text[tokenStart])) {
    tokenStart -= 1;
  }
  tokenStart += 1;
  if (tokenStart >= text.length || text[tokenStart] !== '@') return null;

  const charBefore = tokenStart > 0 ? text[tokenStart - 1] : '';
  if (charBefore && !TOKEN_BREAK_PATTERN.test(charBefore) && !/[([{'"`]/.test(charBefore)) {
    return null;
  }

  const token = text.slice(tokenStart + 1, cursor);
  if (token.length > 32) return null;
  if (![...token].every((char) => HANDLE_PATTERN.test(char))) return null;

  return {
    start: tokenStart,
    end: cursor,
    query: token.toLowerCase(),
  };
}

export function applyMentionTarget(
  text: string,
  queryState: MentionQueryState,
  target: MentionTarget,
): { text: string; cursor: number } {
  const before = text.slice(0, queryState.start);
  const after = text.slice(queryState.end);
  const token = `@${mentionHandle(target)}`;
  const addTrailingSpace = after.length === 0 || !/^[\s.,!?;:)\]}]/.test(after);
  const nextText = `${before}${token}${addTrailingSpace ? ' ' : ''}${after}`;
  const nextCursor = before.length + token.length + (addTrailingSpace ? 1 : 0);
  return { text: nextText, cursor: nextCursor };
}

export function filterMentionTargets(
  targets: MentionTarget[],
  query: string,
  currentUserId?: string | null,
  limit: number = 6,
): MentionTarget[] {
  const q = query.trim().toLowerCase();
  const unique = new Map<string, MentionTarget>();
  for (const target of targets) {
    if (!target.id || unique.has(target.id)) continue;
    if (currentUserId && target.id === currentUserId) continue;
    unique.set(target.id, target);
  }

  const scored = [...unique.values()]
    .map((target) => {
      const handle = mentionHandle(target);
      const name = target.name.toLowerCase();
      if (!q) return { target, score: 3 };
      if (handle.startsWith(q)) return { target, score: 0 };
      if (name.startsWith(q)) return { target, score: 1 };
      if (handle.includes(q)) return { target, score: 2 };
      if (name.includes(q)) return { target, score: 3 };
      return null;
    })
    .filter((entry): entry is { target: MentionTarget; score: number } => entry !== null)
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return a.target.name.localeCompare(b.target.name);
    });

  return scored.slice(0, limit).map((entry) => entry.target);
}

export function splitMentionSegments(text: string): MentionSegment[] {
  if (!text) return [{ text: '', mention: false }];
  const segments: MentionSegment[] = [];
  let cursor = 0;
  const regex = /@[a-zA-Z0-9._-]{1,32}/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const index = match.index;
    const value = match[0];
    const before = index > 0 ? text[index - 1] : '';
    const hasValidBoundary = !before || !HANDLE_PATTERN.test(before);
    if (!hasValidBoundary) continue;

    if (index > cursor) {
      segments.push({ text: text.slice(cursor, index), mention: false });
    }
    segments.push({ text: value, mention: true });
    cursor = index + value.length;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), mention: false });
  }
  return segments.length ? segments : [{ text, mention: false }];
}
