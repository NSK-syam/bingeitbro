/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require('fs');
const sql = fs.readFileSync('supabase-chat-themes-migration.sql', 'utf8');
const apikey = (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();

if (!apikey || !url) {
  throw new Error('Missing SUPABASE_URL and/or SUPABASE_ANON_KEY environment variable');
}

async function run() {
  const commands = sql.split(';').map(s => s.trim()).filter(Boolean);
  for (const cmd of commands) {
    if (cmd.startsWith('--')) continue; // skip simple comments, though some might be multi-line
    console.log('Executing:', cmd.substring(0, 50) + '...');
    const body = { query: cmd };
    const res = await fetch(url + '/rest/v1/rpc/exec', {
      method: 'POST',
      headers: {
        'apikey': apikey,
        'Authorization': 'Bearer ' + apikey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    console.log(res.status, text);
  }
}
run();
