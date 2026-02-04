'use client';

import { useEffect, useState } from 'react';

// Fetch popular movies from different regions/languages
export function MovieBackground() {
  const [posters, setPosters] = useState<string[]>([]);

  useEffect(() => {
    const fetchPosters = async () => {
      const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
      if (!apiKey) return;

      try {
        // Top 10 film industries - fetch popular movies from each
        const queries = [
          // Hollywood (English)
          `https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}&language=en-US&region=US&page=1`,
          `https://api.themoviedb.org/3/movie/top_rated?api_key=${apiKey}&language=en-US&region=US&page=1`,
          // Bollywood (Hindi)
          `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&with_original_language=hi&sort_by=popularity.desc&page=1`,
          // Tollywood (Telugu)
          `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&with_original_language=te&sort_by=popularity.desc&page=1`,
          // Kollywood (Tamil)
          `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&with_original_language=ta&sort_by=popularity.desc&page=1`,
          // Mollywood (Malayalam)
          `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&with_original_language=ml&sort_by=popularity.desc&page=1`,
          // Korean
          `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&with_original_language=ko&sort_by=popularity.desc&page=1`,
          // Japanese
          `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&with_original_language=ja&sort_by=popularity.desc&page=1`,
          // Chinese
          `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&with_original_language=zh&sort_by=popularity.desc&page=1`,
          // French
          `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&with_original_language=fr&sort_by=popularity.desc&page=1`,
          // Spanish
          `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&with_original_language=es&sort_by=popularity.desc&page=1`,
        ];

        const allPosters: string[] = [];

        const responses = await Promise.all(queries.map(url => fetch(url)));
        const data = await Promise.all(responses.map(res => res.json()));

        data.forEach((result) => {
          if (result.results) {
            const moviePosters = result.results
              .filter((m: { poster_path: string | null }) => m.poster_path)
              .slice(0, 10)
              .map((m: { poster_path: string }) => m.poster_path);
            allPosters.push(...moviePosters);
          }
        });

        // Shuffle the posters
        const shuffled = allPosters.sort(() => Math.random() - 0.5);
        setPosters(shuffled);
      } catch (error) {
        console.error('Failed to fetch posters:', error);
      }
    };

    fetchPosters();
  }, []);

  if (posters.length === 0) {
    return null;
  }

  // Triple for seamless scrolling
  const allPosters = [...posters, ...posters, ...posters];

  return (
    <>
      <style jsx global>{`
        @keyframes scrollPosters {
          0% {
            transform: translateY(0);
          }
          100% {
            transform: translateY(-33.33%);
          }
        }
        .poster-scroll {
          animation: scrollPosters 90s linear infinite;
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        {/* Overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to bottom, rgba(10,10,12,0.5) 0%, rgba(10,10,12,0.65) 50%, rgba(10,10,12,0.8) 100%)',
            zIndex: 1,
          }}
        />
        {/* Scrolling poster grid */}
        <div
          className="poster-scroll"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(10, 1fr)',
            gap: '3px',
            opacity: 0.5,
          }}
        >
          {allPosters.map((poster, index) => (
            <div
              key={index}
              style={{
                aspectRatio: '2/3',
                overflow: 'hidden',
              }}
            >
              <img
                src={`https://image.tmdb.org/t/p/w185${poster}`}
                alt=""
                loading="lazy"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
