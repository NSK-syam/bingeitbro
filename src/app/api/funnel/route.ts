import { NextResponse } from 'next/server';

const namePattern = /^[a-z0-9_:-]{2,80}$/;
const keyPattern = /^[a-zA-Z0-9_.-]{1,60}$/;

function sanitizeProps(input: unknown): Record<string, string | number | boolean | null> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  const out: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!keyPattern.test(key)) continue;
    if (value === null || value === undefined) {
      out[key] = null;
      continue;
    }
    if (typeof value === 'boolean') {
      out[key] = value;
      continue;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = value;
      continue;
    }
    if (typeof value === 'string') {
      out[key] = value.length > 160 ? value.slice(0, 160) : value;
    }
  }

  return out;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => null)) as {
      name?: unknown;
      ts?: unknown;
      path?: unknown;
      sessionId?: unknown;
      props?: unknown;
    } | null;

    const name = typeof payload?.name === 'string' ? payload.name.trim().toLowerCase() : '';
    if (!namePattern.test(name)) {
      return NextResponse.json({ ok: false, error: 'invalid_name' }, { status: 400 });
    }

    const event = {
      name,
      ts: typeof payload?.ts === 'string' ? payload.ts : new Date().toISOString(),
      path: typeof payload?.path === 'string' ? payload.path.slice(0, 200) : '',
      sessionId: typeof payload?.sessionId === 'string' ? payload.sessionId.slice(0, 80) : '',
      props: sanitizeProps(payload?.props),
    };

    console.info('[bib-funnel]', JSON.stringify(event));
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
