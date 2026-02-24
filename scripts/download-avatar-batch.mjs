import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
if (!apiKey) throw new Error('Missing NEXT_PUBLIC_TMDB_API_KEY');

const baseDir = path.join(__dirname, '..', 'public', 'avatars');

function sanitizeName(name) {
  return (name || 'item')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'item';
}

async function tmdbJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status} for ${url}`);
  return res.json();
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image ${res.status} for ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buffer);
}

async function getPersonId(name) {
  const data = await tmdbJson(`https://api.themoviedb.org/3/search/person?api_key=${apiKey}&query=${encodeURIComponent(name)}`);
  return data?.results?.[0]?.id ?? null;
}

async function fetchNaniMovies() {
  const personId = await getPersonId('Nani');
  if (!personId) throw new Error('Nani not found on TMDB');

  const urls = [1, 2].map((page) =>
    `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&with_cast=${personId}&with_original_language=te&sort_by=popularity.desc&page=${page}`
  );
  const payloads = await Promise.all(urls.map(tmdbJson));
  const map = new Map();
  for (const p of payloads) {
    for (const m of p?.results ?? []) {
      if (!m?.id || !m?.title || !m?.poster_path) continue;
      if (map.has(m.id)) continue;
      map.set(m.id, m);
    }
  }
  return [...map.values()].slice(0, 8).map((m, idx) => ({
    id: `nani_${idx + 1}`,
    label: m.title,
    fileName: `${sanitizeName(m.title)}.jpg`,
    imageUrl: `https://image.tmdb.org/t/p/w500${m.poster_path}`,
    path: `/avatars/telugu_movies/${sanitizeName(m.title)}.jpg`,
  }));
}

async function fetchEnglishSeries() {
  const urls = [
    ...[1, 2].map((page) => `https://api.themoviedb.org/3/tv/popular?api_key=${apiKey}&language=en-US&page=${page}`),
    ...[1, 2].map((page) => `https://api.themoviedb.org/3/tv/top_rated?api_key=${apiKey}&language=en-US&page=${page}`),
  ];
  const payloads = await Promise.all(urls.map(tmdbJson));
  const map = new Map();
  for (const p of payloads) {
    for (const s of p?.results ?? []) {
      if (!s?.id || !s?.name || !s?.poster_path) continue;
      if ((s.original_language || '').toLowerCase() !== 'en') continue;
      if (map.has(s.id)) continue;
      map.set(s.id, s);
    }
  }
  return [...map.values()].slice(0, 24).map((s, idx) => ({
    id: `eng_series_${idx + 1}`,
    label: s.name,
    fileName: `${sanitizeName(s.name)}.jpg`,
    imageUrl: `https://image.tmdb.org/t/p/w500${s.poster_path}`,
    path: `/avatars/english_web_series/${sanitizeName(s.name)}.jpg`,
  }));
}

async function main() {
  const nani = await fetchNaniMovies();
  const englishSeries = await fetchEnglishSeries();

  for (const item of nani) {
    const dest = path.join(baseDir, 'telugu_movies', item.fileName);
    await download(item.imageUrl, dest);
  }

  for (const item of englishSeries) {
    const dest = path.join(baseDir, 'english_web_series', item.fileName);
    await download(item.imageUrl, dest);
  }

  const out = { nani, englishSeries };
  const outFile = path.join(__dirname, '..', 'new_avatar_batch.json');
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(`Wrote ${outFile}`);
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
