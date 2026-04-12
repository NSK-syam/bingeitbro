import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const apiKey = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
if (!apiKey) throw new Error("Missing TMDB_API_KEY");

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url) {
  for (let i = 0; i < 3; i++) {
    const res = await fetch(url);
    if (res.status === 429) {
      await delay(1000);
      continue;
    }
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    return res.json();
  }
}

async function getActorMovies(actorName, languageCode) {
  // 1. Search for person
  const searchUrl = `https://api.themoviedb.org/3/search/person?api_key=${apiKey}&query=${encodeURIComponent(actorName)}`;
  const searchData = await fetchWithRetry(searchUrl);
  if (!searchData.results || searchData.results.length === 0) {
    console.error(`Actor not found: ${actorName}`);
    return [];
  }
  const personId = searchData.results[0].id;

  // 2. Discover movies by cast member, optionally filtering by language, sorted by revenue (box office)
  let discoverUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&with_cast=${personId}&sort_by=revenue.desc`;
  if (languageCode) {
     discoverUrl += `&with_original_language=${languageCode}`;
  }
  
  const moviesData = await fetchWithRetry(discoverUrl);
  return (moviesData.results || []).slice(0, 3).map(m => ({
    title: m.title,
    poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
    popularity: m.popularity,
    revenue: m.revenue // might not return revenue in discover, but sorts by it
  }));
}

async function main() {
   const teluguActors = ['Prabhas', 'Mahesh Babu', 'Allu Arjun'];
   const englishActors = ['Leonardo DiCaprio', 'Tom Cruise', 'Robert Downey Jr.'];

   console.log("=== TELUGU ===");
   for (const actor of teluguActors) {
       console.log(`\nActor: ${actor}`);
       const movies = await getActorMovies(actor, 'te');
       movies.forEach(m => console.log(`- ${m.title} (${m.poster})`));
       await delay(300);
   }

   console.log("\n=== ENGLISH ===");
   for (const actor of englishActors) {
       console.log(`\nActor: ${actor}`);
       const movies = await getActorMovies(actor, 'en');
       movies.forEach(m => console.log(`- ${m.title} (${m.poster})`));
       await delay(300);
   }
}

main().catch(console.error);

