const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read .env.local
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const env = {};
envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        const key = parts[0].trim();
        let value = parts.slice(1).join('=').trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        env[key] = value;
    }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testSearch(query) {
    console.log(`Testing search for: "${query}"`);

    const startTime = Date.now();

    // Simulate the query from FriendsManager
    // .or(`name.ilike.%${searchQuery}%,username.ilike.%${searchQuery}%`)

    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, name, username') // Select specific columns to check existence
            .or(`name.ilike.%${query}%,username.ilike.%${query}%`)
            .limit(10);

        const duration = Date.now() - startTime;
        console.log(`Query took ${duration}ms`);

        if (error) {
            console.error('Error:', error);
        } else {
            console.log(`Found ${data.length} results:`);
            console.log(JSON.stringify(data, null, 2));
        }
    } catch (err) {
        console.error('Exception:', err);
    }
}

testSearch('a'); // Common letter to match something
