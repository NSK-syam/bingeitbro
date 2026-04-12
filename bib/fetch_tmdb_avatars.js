/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY || '';

const categories = [
  { filter: "discover/movie?with_original_language=en&sort_by=popularity.desc", name: 'english_movies', title: 'Top English Movies' },
  { filter: "discover/tv?with_original_language=en&sort_by=popularity.desc", name: 'english_series', title: 'Top English Series' },
  { filter: "discover/movie?with_original_language=te&sort_by=popularity.desc", name: 'telugu_movies', title: 'Top Telugu Movies' },
  { filter: "discover/tv?with_original_language=te&sort_by=popularity.desc", name: 'telugu_series', title: 'Top Telugu Series' },
];

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

function sanitizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').substring(0, 20);
}

async function main() {
  if (!API_KEY) {
    throw new Error('Missing TMDB_API_KEY environment variable');
  }
  const baseDir = path.join(__dirname, 'public', 'avatars');
  // We'll regenerate the avatar-options.ts content entirely or just generate a new structure to append.
  let tsBlocks = [];

  for (const cat of categories) {
    console.log(`Fetching ${cat.title}...`);
    const url = `https://api.themoviedb.org/3/${cat.filter}&api_key=${API_KEY}`;
    const data = await fetchJson(url);
    const top10 = (data.results || []).slice(0, 10);
    
    // Create Dir
    const catDir = path.join(baseDir, cat.name);
    fs.mkdirSync(catDir, { recursive: true });

    let options = [];
    
    for (let i = 0; i < top10.length; i++) {
        const item = top10[i];
        const title = item.title || item.name;
        if (!item.poster_path) continue;
        
        const imageUrl = `https://image.tmdb.org/t/p/w200${item.poster_path}`;
        const fileName = `${sanitizeName(title)}.jpg`;
        const destPath = path.join(catDir, fileName);
        
        console.log(`Downloading ${title} poster...`);
        await downloadImage(imageUrl, destPath);
        
        options.push(`      { id: '${cat.name}_${i}', path: '/avatars/${cat.name}/${fileName}', label: \`${title.replace(/`/g, '\\`')}\` }`);
    }

    tsBlocks.push(`  {
    name: '${cat.title}',
    options: [
${options.join(',\n')}
    ]
  }`);
  }

  const newTsContent = `export const IMAGE_AVATAR_THEMES: ImageAvatarTheme[] = [
${tsBlocks.join(',\n')}
];`;

  // write a temporary file, string replacements should be done cautiously via API tool instead.
  fs.writeFileSync(path.join(__dirname, 'new_themes.txt'), newTsContent);
  console.log("Downloads complete!");
}

main().catch(console.error);
