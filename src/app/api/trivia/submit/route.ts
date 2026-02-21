import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  // We submit to Supabase via authenticated client calls (RLS + RPC).
  // This route exists only as a future extension point.
  return NextResponse.json({ error: 'Not implemented' }, { status: 501 });
}

