const API_KEY = 'ed40f2b5cbbbdbb2b8fed539462a4e76';

const movies = [
  { id: "1", title: "Baahubali The Beginning", year: 2015 },
  { id: "2", title: "C/O Kancharapalem", year: 2018 },
  { id: "3", title: "Interstellar", year: 2014 },
  { id: "4", title: "Jersey", year: 2019 },
  { id: "5", title: "Breaking Bad", year: 2008 },
  { id: "6", title: "Arjun Reddy", year: 2017 }
];

async function fetchPoster(movie) {
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${API_KEY}&query=${encodeURIComponent(movie.title)}&year=${movie.year}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.results && data.results.length > 0) {
    const result = data.results[0];
    return {
      id: movie.id,
      title: movie.title,
      poster: result.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : null,
      backdrop: result.backdrop_path ? `https://image.tmdb.org/t/p/original${result.backdrop_path}` : null,
      tmdb_id: result.id
    };
  }
  return { id: movie.id, title: movie.title, poster: null, backdrop: null };
}

async function main() {
  for (const movie of movies) {
    const result = await fetchPoster(movie);
    console.log(JSON.stringify(result));
  }
}

main();
