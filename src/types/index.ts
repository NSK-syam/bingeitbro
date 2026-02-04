// The soul of Cinema Chudu - every recommendation tells a story

export interface OTTLink {
  platform: string;
  url: string;
  availableIn?: string; // e.g., "India", "USA", "India & USA"
}

export interface Recommender {
  id: string;
  name: string;
  avatar?: string; // Path to avatar image or emoji
}

export interface Recommendation {
  id: string;
  title: string;
  originalTitle?: string; // For non-English titles
  year: number;
  type: 'movie' | 'series' | 'documentary' | 'anime';

  // The visual
  poster: string; // URL to poster image
  backdrop?: string; // URL to backdrop for detail page

  // The metadata
  genres: string[];
  language: string;
  duration?: string; // "2h 15m" or "6 episodes"
  rating?: number; // IMDb or personal rating out of 10
  certification?: string; // Age rating: "R", "NC-17", "A", "18+", etc.

  // The heart - why this matters
  recommendedBy: Recommender;
  personalNote: string; // "Watch this when..." or "This movie changed my perspective on..."
  mood?: string[]; // ["heartwarming", "intense", "thought-provoking"]
  watchWith?: string; // "Best watched alone" or "Perfect for movie night with friends"

  // The practical
  ottLinks: OTTLink[];

  // Timestamps
  addedOn: string; // ISO date string
}

export interface FilterOptions {
  type?: Recommendation['type'];
  genre?: string;
  language?: string;
  recommendedBy?: string;
  mood?: string;
}
