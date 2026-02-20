const fs = require('fs');
const sql = fs.readFileSync('supabase-chat-themes-migration.sql', 'utf8');
const apikey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpeG92Z251c2pib294c2tpZ21kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5Mjk1OTgsImV4cCI6MjA4NTUwNTU5OH0.jg3aEH1v6SPftqvGvq5cgAtAdH5Zc52REr_0JCHdN50';
const url = 'https://lixovgnusjbooxskigmd.supabase.co';

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
