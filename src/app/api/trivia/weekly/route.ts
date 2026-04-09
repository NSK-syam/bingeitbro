import { NextResponse } from 'next/server';
import { fetchTmdbWithProxy } from '@/lib/tmdb-fetch';

export const runtime = 'nodejs';

type TriviaLanguage = 'en' | 'te' | 'hi' | 'ta';
type TriviaQuestionType = 'year' | 'director' | 'actor' | 'genre' | 'runtime';
type TriviaContextKind = 'movie' | 'show' | 'topic';

type WeeklyTriviaQuestion = {
  id: string;
  tmdbId: number;
  title: string;
  year: number;
  poster: string | null;
  question: string;
  options: string[];
  correctIndex: number;
  contextKind: TriviaContextKind;
  contextLabel: string;
};

const LANGUAGE_LABEL: Record<TriviaLanguage, string> = {
  en: 'English',
  te: 'Telugu',
  hi: 'Hindi',
  ta: 'Tamil',
};

type PresetQuestion = {
  tmdbId: number;
  title: string;
  year: number;
  poster: string | null;
  mediaType?: 'movie' | 'tv';
  question: string;
  options: string[];
  correctIndex: number;
};

const ENGLISH_PRESET_QUESTIONS: PresetQuestion[] = [
  {
    tmdbId: 872585,
    title: 'Oppenheimer',
    year: 2023,
    poster: null,
    question: `In Oppenheimer (2023), what does Cillian Murphy's character famously quote after the Trinity test?`,
    options: [
      'Houston, we have a problem',
      'Now I am become Death, the destroyer of worlds',
      'I am inevitable',
      "That's one small step for man",
    ],
    correctIndex: 1,
  },
  {
    tmdbId: 119051,
    title: 'Wednesday',
    year: 2022,
    poster: null,
    mediaType: 'tv',
    question: 'In Wednesday (2022), what instrument does Wednesday Addams play?',
    options: ['Violin', 'Piano', 'Cello', 'Harp'],
    correctIndex: 2,
  },
  {
    tmdbId: 346698,
    title: 'Barbie',
    year: 2023,
    poster: null,
    question: `In Barbie (2023), what is Ken's "job" in the real world that he gets obsessed with?`,
    options: ['Cryptocurrency', 'The patriarchy', 'Surfing professionally', 'Being a lawyer'],
    correctIndex: 1,
  },
  {
    tmdbId: 93405,
    title: 'Squid Game',
    year: 2021,
    poster: null,
    mediaType: 'tv',
    question: "In Squid Game (2021), what is the first deadly children's game the players must survive?",
    options: ['Musical Chairs', 'Tug of War', 'Red Light, Green Light', 'Hide and Seek'],
    correctIndex: 2,
  },
  {
    tmdbId: 136315,
    title: 'The Bear',
    year: 2022,
    poster: null,
    mediaType: 'tv',
    question: 'In The Bear (2022), what does Carmy keep yelling in the kitchen that became a viral meme?',
    options: ['Behind!', 'Yes, Chef!', 'Order up!', 'Let him cook!'],
    correctIndex: 1,
  },
  {
    tmdbId: 545611,
    title: 'Everything Everywhere All at Once',
    year: 2022,
    poster: null,
    question: 'In Everything Everywhere All at Once (2022), what ridiculous object do characters put on their fingers to jump between universes?',
    options: ['Thimbles', 'Googly eyes', 'Ring Pops', 'Rubber bands'],
    correctIndex: 1,
  },
  {
    tmdbId: 693134,
    title: 'Dune: Part Two',
    year: 2024,
    poster: null,
    question: 'In Dune: Part Two (2024), what do the Fremen ride across the desert?',
    options: ['Giant scorpions', 'Sandworms', 'Hover bikes', 'Armored camels'],
    correctIndex: 1,
  },
  {
    tmdbId: 661374,
    title: 'Glass Onion: A Knives Out Mystery',
    year: 2022,
    poster: null,
    question: 'In Glass Onion: A Knives Out Mystery (2022), where does the murder mystery take place?',
    options: [
      'A haunted castle in Scotland',
      'A private island in Greece',
      'A penthouse in Manhattan',
      'A cruise ship in the Caribbean',
    ],
    correctIndex: 1,
  },
  {
    tmdbId: 66732,
    title: 'Stranger Things',
    year: 2016,
    poster: null,
    mediaType: 'tv',
    question: "In Stranger Things, what is Eleven's favorite food that she's absolutely obsessed with?",
    options: ['Pizza', 'Chicken nuggets', 'Eggo waffles', 'Pop-Tarts'],
    correctIndex: 2,
  },
  {
    tmdbId: 361743,
    title: 'Top Gun: Maverick',
    year: 2022,
    poster: null,
    question: 'In Top Gun: Maverick (2022), Tom Cruise refused to let the jet scenes be done with what?',
    options: ['Stunt doubles', 'Green screens', 'CGI', 'All of the above'],
    correctIndex: 3,
  },
];

const TELUGU_PRESET_QUESTIONS: PresetQuestion[] = [
  {
    tmdbId: 920001,
    title: 'RRR',
    year: 2022,
    poster: null,
    question: 'In RRR (2022), what do Ram Charan and NTR Jr. use to fight the British in the iconic "Naatu Naatu" scene?',
    options: ['Swords', 'Dance moves', 'Guns', 'Magic spells'],
    correctIndex: 1,
  },
  {
    tmdbId: 920002,
    title: 'Pushpa: The Rise',
    year: 2021,
    poster: null,
    question: 'In Pushpa: The Rise (2021), what is Pushpa Raj smuggling?',
    options: ['Gold', 'Diamonds', 'Red sandalwood', 'Ivory'],
    correctIndex: 2,
  },
  {
    tmdbId: 920003,
    title: 'Baahubali',
    year: 2015,
    poster: null,
    question: 'In Baahubali (2015), the iconic question that broke the internet was:',
    options: [
      'Why did Baahubali lose?',
      'Katappa ne Baahubali ko kyun maara?',
      "Who is Baahubali's father?",
      'Where is the Mahishmati kingdom?',
    ],
    correctIndex: 1,
  },
  {
    tmdbId: 920004,
    title: 'Ala Vaikunthapurramuloo',
    year: 2020,
    poster: null,
    question: "In Ala Vaikunthapurramuloo (2020), what is Allu Arjun's character's real family background?",
    options: [
      "He's a secret prince",
      'He was swapped at birth with a rich family\'s son',
      "He's an orphan raised by monks",
      "He's a long-lost twin",
    ],
    correctIndex: 1,
  },
  {
    tmdbId: 920005,
    title: 'Pushpa 2: The Rule',
    year: 2024,
    poster: null,
    question: "In Pushpa 2: The Rule (2024), what is Pushpa's iconic dialogue style known for?",
    options: [
      'Whispering threats',
      'Singing his dialogues',
      '"Thaggede Le" attitude with a shoulder brush',
      'Speaking in reverse',
    ],
    correctIndex: 2,
  },
  {
    tmdbId: 920006,
    title: 'Eega',
    year: 2012,
    poster: null,
    question: 'In Eega (2012), the hero is reborn as what to take revenge?',
    options: ['A snake', 'A housefly', 'A cat', 'A crow'],
    correctIndex: 1,
  },
  {
    tmdbId: 920007,
    title: 'Arjun Reddy',
    year: 2017,
    poster: null,
    question: "In Arjun Reddy (2017), what is Arjun Reddy's profession?",
    options: ['Lawyer', 'Engineer', 'Doctor', 'Cricketer'],
    correctIndex: 2,
  },
  {
    tmdbId: 920008,
    title: 'DJ Tillu',
    year: 2022,
    poster: null,
    question: "In DJ Tillu (2022), what is Tillu's main hustle?",
    options: [
      'He\'s a DJ who solves crimes accidentally',
      "He's a professional dancer",
      'He runs a food truck',
      "He's an undercover cop",
    ],
    correctIndex: 0,
  },
  {
    tmdbId: 920009,
    title: 'Dasara',
    year: 2023,
    poster: null,
    question: 'In Dasara (2023), what industry setting does the story revolve around?',
    options: ['Fishing village', 'Coal mines', 'Tea plantations', 'Film industry'],
    correctIndex: 1,
  },
  {
    tmdbId: 920010,
    title: 'Kalki 2898 AD',
    year: 2024,
    poster: null,
    question: 'In Kalki 2898 AD (2024), the film is set in a dystopian future and draws inspiration from which mythology?',
    options: [
      'Greek mythology',
      'Egyptian mythology',
      'Hindu mythology (Kalki avatar of Vishnu)',
      'Norse mythology',
    ],
    correctIndex: 2,
  },
];

const HINDI_PRESET_QUESTIONS: PresetQuestion[] = [
  {
    tmdbId: 930001,
    title: 'Jawan',
    year: 2023,
    poster: null,
    question: 'In Jawan (2023), Shah Rukh Khan plays how many roles?',
    options: ['One', 'Two (father and son)', 'Three', 'Four'],
    correctIndex: 1,
  },
  {
    tmdbId: 930002,
    title: 'Stree 2',
    year: 2024,
    poster: null,
    question: 'In Stree 2 (2024), what does the headless ghost want from the town?',
    options: ['Gold', 'Women with a special trait', 'Her missing head', 'Revenge on the panchayat'],
    correctIndex: 2,
  },
  {
    tmdbId: 930003,
    title: '3 Idiots',
    year: 2009,
    poster: null,
    question: "In 3 Idiots (2009), what is Rancho's real name revealed at the end?",
    options: ['Raju Rastogi', 'Phunsukh Wangdu', 'Chatur Ramalingam', 'Farhan Qureshi'],
    correctIndex: 1,
  },
  {
    tmdbId: 930004,
    title: 'Animal',
    year: 2023,
    poster: null,
    question: "In Animal (2023), what is Ranbir Kapoor's character obsessed with?",
    options: ['Money and power', 'His relationship with his father', 'Becoming a rockstar', 'Winning a court case'],
    correctIndex: 1,
  },
  {
    tmdbId: 930005,
    title: 'Pathaan',
    year: 2023,
    poster: null,
    question: 'In Pathaan (2023), what colour outfit did Deepika wear in the "Besharam Rang" song that caused a national debate?',
    options: ['Red', 'Saffron/Orange bikini', 'White', 'Green'],
    correctIndex: 1,
  },
  {
    tmdbId: 930006,
    title: 'Gangs of Wasseypur',
    year: 2012,
    poster: null,
    question: 'In Gangs of Wasseypur, the iconic line "Tumse na ho payega" was said to whom?',
    options: ['Faizal Khan', 'Sultan', 'Definite', 'Perpendicular'],
    correctIndex: 0,
  },
  {
    tmdbId: 930007,
    title: 'Kantara',
    year: 2022,
    poster: null,
    question: 'In Kantara (Hindi dubbed, 2022), the climax features the hero channeling what?',
    options: ['A tiger spirit', 'The Panjurli Daiva (demigod spirit)', 'Lord Shiva', 'An ancient warrior ghost'],
    correctIndex: 1,
  },
  {
    tmdbId: 930008,
    title: '12th Fail',
    year: 2023,
    poster: null,
    question: 'In 12th Fail (2023), the film is based on the true story of someone who became a:',
    options: ['Bollywood actor', 'IPS officer', 'Cricketer', 'Scientist'],
    correctIndex: 1,
  },
  {
    tmdbId: 930009,
    title: 'Dunki',
    year: 2023,
    poster: null,
    question: 'In Dunki (2023), "Dunki" refers to what?',
    options: ['A donkey', 'An illegal immigration route (donkey route)', 'A type of dance', 'A card game'],
    correctIndex: 1,
  },
  {
    tmdbId: 930010,
    title: 'Panchayat',
    year: 2020,
    poster: null,
    mediaType: 'tv',
    question: "In Panchayat (web series), what is Abhishek's actual dream job while he's stuck as a Panchayat secretary?",
    options: ['IAS officer', 'MBA from IIM', 'Software engineer at Google', 'CAT aspirant wanting a corporate job'],
    correctIndex: 3,
  },
];

const TAMIL_PRESET_QUESTIONS: PresetQuestion[] = [
  {
    tmdbId: 940001,
    title: 'Ponniyin Selvan',
    year: 2022,
    poster: null,
    question: 'In Ponniyin Selvan (2022), the story is set during which dynasty?',
    options: ['Mughal dynasty', 'Chola dynasty', 'Pallava dynasty', 'Pandya dynasty'],
    correctIndex: 1,
  },
  {
    tmdbId: 940002,
    title: 'Vikram',
    year: 2022,
    poster: null,
    question: "In Vikram (2022), what is the code name for Kamal Haasan's character?",
    options: ['Agent 47', 'Vikram', 'Karnan', 'Rolex'],
    correctIndex: 1,
  },
  {
    tmdbId: 940003,
    title: 'Jailer',
    year: 2023,
    poster: null,
    question: 'In Jailer (2023), Rajinikanth plays a retired what?',
    options: ['Army general', 'Jail warden / DGP', 'School teacher', 'Spy'],
    correctIndex: 1,
  },
  {
    tmdbId: 940004,
    title: 'Master',
    year: 2021,
    poster: null,
    question: 'In Master (2021), Vijay\'s character goes to teach at what kind of institution?',
    options: ['An elite private school', 'A juvenile detention center', 'A military academy', 'A rural village school'],
    correctIndex: 1,
  },
  {
    tmdbId: 940005,
    title: 'Jai Bhim',
    year: 2021,
    poster: null,
    question: 'In Jai Bhim (2021), Suriya plays a real-life:',
    options: ['Police officer', 'Doctor', 'Lawyer / High Court advocate', 'Journalist'],
    correctIndex: 2,
  },
  {
    tmdbId: 940006,
    title: 'Leo',
    year: 2023,
    poster: null,
    question: "In Leo (2023), what is Vijay's character secretly hiding from his past?",
    options: ['He was a spy', 'He was a violent gangster/assassin', 'He was a failed actor', 'He was a corrupt politician'],
    correctIndex: 1,
  },
  {
    tmdbId: 940007,
    title: 'Sarpatta Parambarai',
    year: 2021,
    poster: null,
    question: 'In Sarpatta Parambarai (2021), the film revolves around which sport in 1970s Madras?',
    options: ['Cricket', 'Kabaddi', 'Boxing', 'Wrestling'],
    correctIndex: 2,
  },
  {
    tmdbId: 940008,
    title: 'The GOAT',
    year: 2024,
    poster: null,
    question: 'In the GOAT (2024), Vijay\'s character involves what sci-fi element?',
    options: ['Alien contact', 'Time travel / de-aging', 'Teleportation', 'Mind reading'],
    correctIndex: 1,
  },
  {
    tmdbId: 940009,
    title: 'Kaithi',
    year: 2019,
    poster: null,
    question: 'In Kaithi (2019), the entire movie takes place in roughly how long (story time)?',
    options: ['One week', 'One single night', 'One year', 'One month'],
    correctIndex: 1,
  },
  {
    tmdbId: 940010,
    title: 'Asuran',
    year: 2019,
    poster: null,
    question: 'In Asuran (2019), Dhanush\'s character transforms from a peaceful farmer into a fighter because of:',
    options: ['A land dispute threatening his family', 'A cricket match gone wrong', 'A political rivalry', 'A treasure hunt'],
    correctIndex: 0,
  },
];

const PRESET_QUESTIONS_BY_LANGUAGE: Record<TriviaLanguage, PresetQuestion[]> = {
  en: ENGLISH_PRESET_QUESTIONS,
  te: TELUGU_PRESET_QUESTIONS,
  hi: HINDI_PRESET_QUESTIONS,
  ta: TAMIL_PRESET_QUESTIONS,
};

function buildPresetQuestions(
  language: TriviaLanguage,
  weekKey: string,
): Array<WeeklyTriviaQuestion & { mediaType: 'movie' | 'tv' }> {
  return PRESET_QUESTIONS_BY_LANGUAGE[language].map((q, idx) => ({
    id: `${weekKey}:${language}:preset:${idx + 1}`,
    tmdbId: q.tmdbId,
    title: q.title,
    year: q.year,
    poster: q.poster,
    mediaType: q.mediaType ?? 'movie',
    question: q.question,
    options: q.options,
    correctIndex: q.correctIndex,
    contextKind: (q.mediaType ?? 'movie') === 'tv' ? 'show' : 'movie',
    contextLabel: q.title,
  }));
}

function toPosterUrl(path: string | null | undefined): string | null {
  if (!path || typeof path !== 'string') return null;
  return `https://image.tmdb.org/t/p/w342${path}`;
}

async function resolvePresetPoster(
  question: {
    tmdbId: number;
    title: string;
    year: number;
    poster: string | null;
    mediaType?: 'movie' | 'tv';
  },
  apiKey: string,
  origin: string,
): Promise<string | null> {
  if (question.poster) return question.poster;
  const mediaType = question.mediaType ?? 'movie';
  const apiKeyQuery = apiKey ? `api_key=${encodeURIComponent(apiKey)}&` : '';

  if (question.tmdbId > 0 && question.tmdbId < 900000) {
    try {
      const byIdUrl = `https://api.themoviedb.org/3/${mediaType}/${question.tmdbId}?${apiKeyQuery}language=en-US`;
      const byIdRes = await fetchTmdbWithProxy(byIdUrl, undefined, { preferProxy: true, origin });
      if (byIdRes.ok) {
        const byIdJson = (await byIdRes.json()) as { poster_path?: string | null };
        const poster = toPosterUrl(byIdJson.poster_path);
        if (poster) return poster;
      }
    } catch {
      // fall through to search
    }
  }

  try {
    const searchParams = mediaType === 'tv'
      ? `query=${encodeURIComponent(question.title)}&first_air_date_year=${question.year}`
      : `query=${encodeURIComponent(question.title)}&year=${question.year}`;
    const searchUrl = `https://api.themoviedb.org/3/search/${mediaType}?${apiKeyQuery}${searchParams}&include_adult=false&page=1`;
    const searchRes = await fetchTmdbWithProxy(searchUrl, undefined, { preferProxy: true, origin });
    if (!searchRes.ok) return null;
    const searchJson = (await searchRes.json()) as { results?: Array<{ poster_path?: string | null }> };
    const first = Array.isArray(searchJson.results) ? searchJson.results[0] : undefined;
    return toPosterUrl(first?.poster_path);
  } catch {
    return null;
  }
}

async function hydratePresetQuestionPosters(
  questions: Array<{
    id: string;
    tmdbId: number;
    title: string;
    year: number;
    poster: string | null;
    mediaType: 'movie' | 'tv';
    question: string;
    options: string[];
    correctIndex: number;
    contextKind: TriviaContextKind;
    contextLabel: string;
  }>,
  apiKey: string,
  origin: string,
) {
  return Promise.all(
    questions.map(async (q) => ({
      ...q,
      mediaType: q.mediaType ?? 'movie',
      poster: await resolvePresetPoster(q, apiKey, origin),
    })),
  );
}

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function xorshift32(seed: number) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0xffffffff;
  };
}

function isoWeekKeyUTC(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Thursday of this week decides the year.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

type DiscoverMovieCandidate = {
  id: number;
  title: string;
  release_date: string;
  poster_path?: string | null;
};

type TmdbMovieDetailPayload = {
  genres?: Array<{ name?: string | null }>;
  runtime?: number | null;
  credits?: {
    crew?: Array<{ job?: string | null; name?: string | null }>;
    cast?: Array<{ name?: string | null }>;
  };
};

function isDiscoverMovieCandidate(value: unknown): value is DiscoverMovieCandidate {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'number' &&
    typeof candidate.title === 'string' &&
    typeof candidate.release_date === 'string'
  );
}

async function fetchDiscoverMovies(params: {
  apiKey: string;
  language: TriviaLanguage;
  page: number;
  voteCountMin: number;
  origin?: string;
}): Promise<{ results: unknown[]; totalPages: number }> {
  const base = `https://api.themoviedb.org/3/discover/movie?api_key=${params.apiKey}` +
    `&with_original_language=${params.language}` +
    `&primary_release_date.gte=2000-01-01&primary_release_date.lte=2026-12-31` +
    `&vote_count.gte=${params.voteCountMin}` +
    `&include_adult=false&sort_by=popularity.desc` +
    `&page=${params.page}`;

  try {
    const res = await fetchTmdbWithProxy(base, undefined, { preferProxy: true, origin: params.origin });
    if (!res.ok) return { results: [], totalPages: 0 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();
    const results = Array.isArray(json?.results) ? json.results : [];
    const totalPages = Number.isFinite(Number(json?.total_pages)) ? Number(json.total_pages) : 0;
    return { results, totalPages };
  } catch {
    return { results: [], totalPages: 0 };
  }
}

function pickYearOptions(correct: number, rand: () => number): { options: number[]; correctIndex: number } {
  const minYear = 2000;
  const maxYear = 2026;
  const years = new Set<number>([correct]);

  const deltas = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  while (years.size < 4) {
    const delta = deltas[Math.floor(rand() * deltas.length)] ?? 3;
    const dir = rand() > 0.5 ? 1 : -1;
    const candidate = Math.min(maxYear, Math.max(minYear, correct + dir * delta));
    years.add(candidate);
  }

  const arr = Array.from(years);
  // Fisher-Yates shuffle
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j]!;
    arr[j] = tmp!;
  }

  return { options: arr, correctIndex: arr.indexOf(correct) };
}

function pickRuntimeOptions(correct: number, rand: () => number): { options: string[]; correctIndex: number } {
  const min = 45;
  const max = 240;
  const minutes = new Set<number>([Math.min(max, Math.max(min, Math.round(correct)))]);
  const deltas = [5, 10, 15, 20, 25, 30, 35, 40];
  while (minutes.size < 4) {
    const delta = deltas[Math.floor(rand() * deltas.length)] ?? 15;
    const dir = rand() > 0.5 ? 1 : -1;
    const candidate = Math.min(max, Math.max(min, correct + dir * delta));
    minutes.add(Math.round(candidate));
  }
  const arr = Array.from(minutes).map((m) => `${m} min`);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j]!;
    arr[j] = tmp!;
  }
  return { options: arr, correctIndex: arr.indexOf(`${Math.round(correct)} min`) };
}

function normalizeLanguage(input: string | null): TriviaLanguage {
  const v = String(input || '').trim().toLowerCase();
  if (v === 'en' || v === 'te' || v === 'hi' || v === 'ta') return v;
  return 'en';
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const idx = nextIndex;
      nextIndex += 1;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]!, idx);
    }
  };
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const language = normalizeLanguage(url.searchParams.get('lang'));
  const weekKey = (url.searchParams.get('week') || '').trim() || isoWeekKeyUTC();
  const origin = url.origin;
  const apiKey = (process.env.TMDB_API_KEY ?? process.env.NEXT_PUBLIC_TMDB_API_KEY ?? '').trim();
  const responseHeaders = {
    'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
  };

  if (PRESET_QUESTIONS_BY_LANGUAGE[language]?.length === 10) {
    let questions = buildPresetQuestions(language, weekKey);
    questions = await hydratePresetQuestionPosters(questions, apiKey, origin);
    return NextResponse.json(
      {
        weekKey,
        language,
        languageLabel: LANGUAGE_LABEL[language],
        questions,
      },
      {
        headers: responseHeaders,
      },
    );
  }

  if (!apiKey) {
    return NextResponse.json({ error: 'TMDB is not configured.' }, { status: 500 });
  }

  const seed = fnv1a32(`${weekKey}:${language}`);
  const rand = xorshift32(seed || 1);

  // Build a stable weekly set, but always include page 1 to avoid empty results
  // when TMDB has only a few pages for a language+filters.
  const collectCandidates = async (voteCountMin: number, pagesWanted: number) => {
    const page1 = await fetchDiscoverMovies({ apiKey, language, page: 1, voteCountMin, origin });
    const maxPages = Math.max(1, Math.min(12, page1.totalPages || 1));
    const pagePool = Array.from({ length: Math.max(0, maxPages - 1) }, (_, i) => i + 2);
    // Seeded shuffle page pool.
    for (let i = pagePool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = pagePool[i];
      pagePool[i] = pagePool[j]!;
      pagePool[j] = tmp!;
    }
    const pages = [1, ...pagePool.slice(0, Math.max(0, pagesWanted - 1))];
    const settled = await Promise.all(
      pages.map((page) => fetchDiscoverMovies({ apiKey, language, page, voteCountMin, origin })),
    );

    const merged: unknown[] = [];
    for (const s of settled) merged.push(...(Array.isArray(s.results) ? s.results : []));

    const seenIds = new Set<number>();
    const candidates = merged
      .filter(isDiscoverMovieCandidate)
      .filter((m) => {
        const year = Number(String(m.release_date).slice(0, 4));
        return Number.isFinite(year) && year >= 2000 && year <= 2026;
      })
      .filter((m) => {
        if (seenIds.has(m.id)) return false;
        seenIds.add(m.id);
        return true;
      });

    // Seeded shuffle candidates to avoid always the same top 10.
    for (let i = candidates.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = candidates[i];
      candidates[i] = candidates[j];
      candidates[j] = tmp;
    }
    return candidates;
  };

  // Try strict first; relax if this language has fewer qualifying titles.
  let candidates = await collectCandidates(200, 3);
  if (candidates.length < 10) candidates = await collectCandidates(50, 4);
  if (candidates.length < 10) candidates = await collectCandidates(10, 6);

  const picked = candidates.slice(0, 10);

  type PickedBase = {
    id: number;
    title: string;
    release_date: string;
    poster_path: string | null;
  };
  const basePicked: PickedBase[] = picked.map((m) => ({
      id: m.id as number,
      title: m.title as string,
      release_date: m.release_date as string,
      poster_path: typeof m.poster_path === 'string' ? m.poster_path : null,
    }));

  const details = await mapWithConcurrency(basePicked, 4, async (m) => {
    const detailUrl = `https://api.themoviedb.org/3/movie/${m.id}?api_key=${apiKey}&append_to_response=credits`;
    const res = await fetchTmdbWithProxy(detailUrl, undefined, { preferProxy: true, origin });
    const json: TmdbMovieDetailPayload | null = res.ok ? (await res.json()) as TmdbMovieDetailPayload : null;
    const year = Number(String(m.release_date).slice(0, 4));
    const poster = m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : null;

    const genres: string[] = Array.isArray(json?.genres)
      ? json.genres.map((g) => String(g?.name || '')).filter(Boolean)
      : [];

    const runtimeValue = json?.runtime ?? null;
    const runtime = Number.isFinite(Number(runtimeValue)) ? Number(runtimeValue) : null;

    const credits = json?.credits;

    const director = Array.isArray(credits?.crew)
      ? credits.crew.find((c) => c?.job === 'Director')?.name ?? undefined
      : undefined;

    const cast: string[] = Array.isArray(credits?.cast)
      ? credits.cast.slice(0, 8).map((c) => String(c?.name || '')).filter(Boolean)
      : [];

    return {
      tmdbId: m.id,
      title: m.title,
      year,
      poster,
      genres,
      runtime,
      director: director && String(director).trim() ? String(director).trim() : null,
      cast,
    };
  });

  const directorPool = [...new Set(details.map((d) => d.director).filter(Boolean))] as string[];
  const actorPool = [...new Set(details.flatMap((d) => d.cast).filter(Boolean))] as string[];
  const genrePool = [...new Set(details.flatMap((d) => d.genres).filter(Boolean))] as string[];

  const desiredTypes: TriviaQuestionType[] = ['director', 'actor', 'genre', 'runtime', 'year', 'director', 'actor', 'genre', 'runtime', 'year'];
  for (let i = desiredTypes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = desiredTypes[i];
    desiredTypes[i] = desiredTypes[j]!;
    desiredTypes[j] = tmp!;
  }

  const questions = details.map((d, idx) => {
    const type = desiredTypes[idx] ?? 'year';

    const buildYear = () => {
      const { options, correctIndex } = pickYearOptions(d.year, rand);
      return {
        question: `In which year was "${d.title}" released?`,
        options: options.map(String),
        correctIndex,
      };
    };

    const buildDirector = () => {
      if (!d.director) return null;
      const other = directorPool.filter((n) => n !== d.director);
      if (other.length < 3) return null;
      const opts = new Set<string>([d.director]);
      while (opts.size < 4) {
        const pick = other[Math.floor(rand() * other.length)];
        if (pick) opts.add(pick);
      }
      const arr = Array.from(opts);
      for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j]!;
        arr[j] = tmp!;
      }
      return {
        question: `Who directed "${d.title}"?`,
        options: arr,
        correctIndex: arr.indexOf(d.director),
      };
    };

    const buildActor = () => {
      if (!d.cast.length) return null;
      const correct = d.cast[Math.floor(rand() * Math.min(5, d.cast.length))]!;
      const other = actorPool.filter((n) => n !== correct);
      if (other.length < 3) return null;
      const opts = new Set<string>([correct]);
      while (opts.size < 4) {
        const pick = other[Math.floor(rand() * other.length)];
        if (pick) opts.add(pick);
      }
      const arr = Array.from(opts);
      for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j]!;
        arr[j] = tmp!;
      }
      return {
        question: `Which actor appears in "${d.title}"?`,
        options: arr,
        correctIndex: arr.indexOf(correct),
      };
    };

    const buildGenre = () => {
      const correct = d.genres[0];
      if (!correct) return null;
      const other = genrePool.filter((g) => g !== correct);
      if (other.length < 3) return null;
      const opts = new Set<string>([correct]);
      while (opts.size < 4) {
        const pick = other[Math.floor(rand() * other.length)];
        if (pick) opts.add(pick);
      }
      const arr = Array.from(opts);
      for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j]!;
        arr[j] = tmp!;
      }
      return {
        question: `Which genre best fits "${d.title}"?`,
        options: arr,
        correctIndex: arr.indexOf(correct),
      };
    };

    const buildRuntime = () => {
      if (!d.runtime || d.runtime < 30) return null;
      const { options, correctIndex } = pickRuntimeOptions(d.runtime, rand);
      if (correctIndex < 0) return null;
      return {
        question: `About how long is "${d.title}"?`,
        options,
        correctIndex,
      };
    };

    const built =
      (type === 'director' ? buildDirector() : null) ??
      (type === 'actor' ? buildActor() : null) ??
      (type === 'genre' ? buildGenre() : null) ??
      (type === 'runtime' ? buildRuntime() : null) ??
      null;

    const finalBuilt =
      built ??
      buildDirector() ??
      buildActor() ??
      buildGenre() ??
      buildRuntime() ??
      buildYear();

    return {
      id: `${weekKey}:${language}:${d.tmdbId}:${idx}`,
      tmdbId: d.tmdbId,
      title: d.title,
      year: d.year,
      poster: d.poster,
      question: finalBuilt.question,
      options: finalBuilt.options,
      correctIndex: finalBuilt.correctIndex,
      contextKind: 'movie',
      contextLabel: d.title,
    };
  });

  return NextResponse.json(
    {
      weekKey,
      language,
      languageLabel: LANGUAGE_LABEL[language],
      questions,
    },
    {
      headers: responseHeaders,
    },
  );
}
