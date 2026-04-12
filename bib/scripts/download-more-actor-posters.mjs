import fs from 'fs';
import path from 'path';

const outDir = path.join(process.cwd(), 'public', 'avatars');

const movies = [
  { group: 'telugu_movies', id: 'ram_1', url: 'https://image.tmdb.org/t/p/w500/u0XUBNQWlOvrh0Gd97ARGpIkL0.jpg', label: 'RRR' },
  { group: 'telugu_movies', id: 'ram_2', url: 'https://image.tmdb.org/t/p/w500/qtOGsZoLW7QceqKmsOy5nSM6Aik.jpg', label: 'Game Changer' },
  { group: 'telugu_movies', id: 'ram_3', url: 'https://image.tmdb.org/t/p/w500/xK7MEV56GF291VG0U5XnVJuvNv3.jpg', label: 'Magadheera' },
  { group: 'telugu_movies', id: 'ntr_1', url: 'https://image.tmdb.org/t/p/w500/u0XUBNQWlOvrh0Gd97ARGpIkL0.jpg', label: 'RRR' },
  { group: 'telugu_movies', id: 'ntr_2', url: 'https://image.tmdb.org/t/p/w500/lQfuaXjANoTsdx5iS0gCXlK9D2L.jpg', label: 'Devara: Part 1' },
  { group: 'telugu_movies', id: 'ntr_3', url: 'https://image.tmdb.org/t/p/w500/3K2FHqArJP7TH9gnM8DVsZT20mT.jpg', label: 'Oosaravelli' },
  { group: 'telugu_movies', id: 'pawan_1', url: 'https://image.tmdb.org/t/p/w500/tFDhzLPhWnjDNda7YHcbeB4gcGi.jpg', label: 'Gabbar Singh' },
  { group: 'telugu_movies', id: 'pawan_2', url: 'https://image.tmdb.org/t/p/w500/rTuRBrq4VPVSq0On20mYgOeW1ik.jpg', label: 'Komaram Puli' },
  { group: 'telugu_movies', id: 'pawan_3', url: 'https://image.tmdb.org/t/p/w500/xkgp35nyquBbMPb0ICJUF188vPG.jpg', label: 'Tholi Prema' },

  { group: 'english_movies', id: 'pitt_1', url: 'https://image.tmdb.org/t/p/w500/to0spRl1CMDvyUbOnbb4fTk3VAd.jpg', label: 'Deadpool 2' },
  { group: 'english_movies', id: 'pitt_2', url: 'https://image.tmdb.org/t/p/w500/vqBmyAj0Xm9LnS1xe1MSlMAJyHq.jpg', label: 'F1' },
  { group: 'english_movies', id: 'pitt_3', url: 'https://image.tmdb.org/t/p/w500/aCnVdvExw6UWSeQfr0tUH3jr4qG.jpg', label: 'World War Z' },
  { group: 'english_movies', id: 'bale_1', url: 'https://image.tmdb.org/t/p/w500/hr0L2aueqlP2BYUblTTjmtn0hw4.jpg', label: 'The Dark Knight Rises' },
  { group: 'english_movies', id: 'bale_2', url: 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg', label: 'The Dark Knight' },
  { group: 'english_movies', id: 'bale_3', url: 'https://image.tmdb.org/t/p/w500/pIkRyD18kl4FhoCNQuWxWu5cBLM.jpg', label: 'Thor: Love and Thunder' },
  { group: 'english_movies', id: 'depp_1', url: 'https://image.tmdb.org/t/p/w500/uXEqmloGyP7UXAiphJUu2v2pcuE.jpg', label: 'Pirates of the Caribbean: Dead Man\'s Chest' },
  { group: 'english_movies', id: 'depp_2', url: 'https://image.tmdb.org/t/p/w500/keGfSvCmYj7CvdRx36OdVrAEibE.jpg', label: 'Pirates of the Caribbean: On Stranger Tides' },
  { group: 'english_movies', id: 'depp_3', url: 'https://image.tmdb.org/t/p/w500/o0kre9wRCZz3jjSjaru7QU0UtFz.jpg', label: 'Alice in Wonderland' }
];

async function main() {
  for (const m of movies) {
    const dir = path.join(outDir, m.group);
    fs.mkdirSync(dir, { recursive: true });
    
    const filePath = path.join(dir, `${m.id}.jpg`);
    console.log(`Downloading ${m.label}...`);
    
    try {
      const res = await fetch(m.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      fs.writeFileSync(filePath, buffer);
      console.log(`Saved: ${filePath}`);
    } catch (err) {
      console.error(`Failed to download ${m.label}:`, err);
    }
  }
}

main().catch(console.error);
