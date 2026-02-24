import fs from 'fs';
import path from 'path';

const outDir = path.join(process.cwd(), 'public', 'avatars');

const movies = [
  { group: 'telugu_movies', id: 'prabhas_1', url: 'https://image.tmdb.org/t/p/w500/21sC2assImQIYCEDA84Qh9d1RsK.jpg', label: 'Bāhubali 2: The Conclusion' },
  { group: 'telugu_movies', id: 'prabhas_2', url: 'https://image.tmdb.org/t/p/w500/rstcAnBeCkxNQjNp3YXrF6IP1tW.jpg', label: 'Kalki 2898-AD' },
  { group: 'telugu_movies', id: 'prabhas_3', url: 'https://image.tmdb.org/t/p/w500/9BAjt8nSSms62uOVYn1t3C3dVto.jpg', label: 'Bāhubali: The Beginning' },
  { group: 'telugu_movies', id: 'mahesh_1', url: 'https://image.tmdb.org/t/p/w500/6bJNy4oHbRawb6j3FN2JAuKw7uh.jpg', label: 'Sarileru Neekevvaru' },
  { group: 'telugu_movies', id: 'mahesh_2', url: 'https://image.tmdb.org/t/p/w500/a0hFV8G0ofyPgPEjVcYrueuxFex.jpg', label: 'Bharat Ane Nenu' },
  { group: 'telugu_movies', id: 'mahesh_3', url: 'https://image.tmdb.org/t/p/w500/pV6xLQh54ga8oaQqJtUqLp12LwQ.jpg', label: 'Maharshi' },
  { group: 'telugu_movies', id: 'allu_1', url: 'https://image.tmdb.org/t/p/w500/t5ePZYRibJ0EEK1FK3GhihVkDW5.jpg', label: 'Pushpa 2 - The Rule' },
  { group: 'telugu_movies', id: 'allu_2', url: 'https://image.tmdb.org/t/p/w500/h6Pd89ngvl9quPVsx3KoJlQsvk9.jpg', label: 'Pushpa: The Rise' },
  { group: 'telugu_movies', id: 'allu_3', url: 'https://image.tmdb.org/t/p/w500/goVGxWzvxs8oMNJ1Zc0QmfJlIzs.jpg', label: 'Ala Vaikunthapurramuloo' },

  { group: 'english_movies', id: 'leo_1', url: 'https://image.tmdb.org/t/p/w500/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg', label: 'Titanic' },
  { group: 'english_movies', id: 'leo_2', url: 'https://image.tmdb.org/t/p/w500/xlaY2zyzMfkhk0HSC5VUwzoZPU1.jpg', label: 'Inception' },
  { group: 'english_movies', id: 'leo_3', url: 'https://image.tmdb.org/t/p/w500/ji3ecJphATlVgWNY0B0RVXZizdf.jpg', label: 'The Revenant' },
  { group: 'english_movies', id: 'cruise_1', url: 'https://image.tmdb.org/t/p/w500/62HCnUTziyWcpDaBO2i1DX17ljH.jpg', label: 'Top Gun: Maverick' },
  { group: 'english_movies', id: 'cruise_2', url: 'https://image.tmdb.org/t/p/w500/AkJQpZp9WoNdj7pLYSj1L0RcMMN.jpg', label: 'Mission: Impossible - Fallout' },
  { group: 'english_movies', id: 'cruise_3', url: 'https://image.tmdb.org/t/p/w500/eRZTGx7GsiKqPch96k27LK005ZL.jpg', label: 'Mission: Impossible - Ghost Protocol' },
  { group: 'english_movies', id: 'rdj_1', url: 'https://image.tmdb.org/t/p/w500/ulzhLuWrPK07P1YkdWQLZnQh1JL.jpg', label: 'Avengers: Endgame' },
  { group: 'english_movies', id: 'rdj_2', url: 'https://image.tmdb.org/t/p/w500/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg', label: 'Avengers: Infinity War' },
  { group: 'english_movies', id: 'rdj_3', url: 'https://image.tmdb.org/t/p/w500/RYMX2wcKCBAr24UyPD7xwmjaTn.jpg', label: 'The Avengers' }
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
