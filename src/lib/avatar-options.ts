/**
 * Movie-themed profile picture options for users.
 * Used for signup defaults and the avatar picker.
 */

export interface AvatarOption {
  emoji: string;
  label: string;
}

/** Classic cinema & film */
const CLASSIC_CINEMA: AvatarOption[] = [
  { emoji: '', label: 'Clapper' },
  { emoji: '', label: 'Theater' },
  { emoji: '', label: 'Circus' },
  { emoji: '', label: 'Target' },
  { emoji: '', label: 'Projector' },
  { emoji: '', label: 'Film' },
  { emoji: '', label: 'VHS' },
  { emoji: '', label: 'Movie camera' },
];

/** Snacks & watch vibes */
const SNACKS_AND_VIBES: AvatarOption[] = [
  { emoji: '', label: 'Popcorn' },
  { emoji: '', label: 'Drink' },
  { emoji: '', label: 'Chocolate' },
  { emoji: '', label: 'Pizza' },
  { emoji: '', label: 'Couch' },
  { emoji: '', label: 'Night' },
  { emoji: '', label: 'Star' },
  { emoji: '', label: 'Glow' },
];

/** Music & drama */
const MUSIC_AND_DRAMA: AvatarOption[] = [
  { emoji: '', label: 'Guitar' },
  { emoji: '', label: 'Piano' },
  { emoji: '', label: 'Mic' },
  { emoji: '', label: 'Headphones' },
  { emoji: '', label: 'Music' },
  { emoji: '', label: 'Notes' },
  { emoji: '', label: 'Trumpet' },
  { emoji: '', label: 'Violin' },
];

/** Fun & celebration */
const FUN_AND_CELEBRATION: AvatarOption[] = [
  { emoji: '', label: 'Party' },
  { emoji: '', label: 'Confetti' },
  { emoji: '', label: 'Dice' },
  { emoji: '', label: 'Fire' },
  { emoji: '', label: 'Dizzy' },
  { emoji: '', label: 'Sparkle' },
  { emoji: '', label: 'Rainbow' },
  { emoji: '', label: 'Gift' },
];

export const AVATAR_THEMES = [
  { name: 'Classic cinema', options: CLASSIC_CINEMA },
  { name: 'Snacks & vibes', options: SNACKS_AND_VIBES },
  { name: 'Music & drama', options: MUSIC_AND_DRAMA },
  { name: 'Fun & celebration', options: FUN_AND_CELEBRATION },
] as const;

/** Flat list of all emojis for random pick (e.g. signup) */
export const ALL_AVATAR_EMOJIS: string[] = AVATAR_THEMES.flatMap((t) =>
  t.options.map((o) => o.emoji)
);

export function getRandomMovieAvatar(): string {
  return ALL_AVATAR_EMOJIS[Math.floor(Math.random() * ALL_AVATAR_EMOJIS.length)];
}

export interface ImageAvatarOption {
  id: string;
  path: string;
  label?: string;
}

export interface ImageAvatarTheme {
  name: string;
  options: ImageAvatarOption[];
}

export const IMAGE_AVATAR_THEMES: ImageAvatarTheme[] = [
  {
    name: 'Top English Movies',
    options: [
      { id: 'leo_1', path: '/avatars/english_movies/leo_1.jpg', label: `Titanic` },
      { id: 'leo_2', path: '/avatars/english_movies/leo_2.jpg', label: `Inception` },
      { id: 'leo_3', path: '/avatars/english_movies/leo_3.jpg', label: `The Revenant` },
      { id: 'cruise_1', path: '/avatars/english_movies/cruise_1.jpg', label: `Top Gun: Maverick` },
      { id: 'cruise_2', path: '/avatars/english_movies/cruise_2.jpg', label: `Mission: Impossible - Fallout` },
      { id: 'cruise_3', path: '/avatars/english_movies/cruise_3.jpg', label: `Mission: Impossible - Ghost Protocol` },
      { id: 'rdj_1', path: '/avatars/english_movies/rdj_1.jpg', label: `Avengers: Endgame` },
      { id: 'rdj_2', path: '/avatars/english_movies/rdj_2.jpg', label: `Avengers: Infinity War` },
      { id: 'rdj_3', path: '/avatars/english_movies/rdj_3.jpg', label: `The Avengers` },
      { id: 'pitt_1', path: '/avatars/english_movies/pitt_1.jpg', label: `Deadpool 2` },
      { id: 'pitt_2', path: '/avatars/english_movies/pitt_2.jpg', label: `F1` },
      { id: 'pitt_3', path: '/avatars/english_movies/pitt_3.jpg', label: `World War Z` },
      { id: 'bale_1', path: '/avatars/english_movies/bale_1.jpg', label: `The Dark Knight Rises` },
      { id: 'bale_2', path: '/avatars/english_movies/bale_2.jpg', label: `The Dark Knight` },
      { id: 'bale_3', path: '/avatars/english_movies/bale_3.jpg', label: `Thor: Love and Thunder` },
      { id: 'depp_1', path: '/avatars/english_movies/depp_1.jpg', label: `Pirates of the Caribbean: Dead Man's Chest` },
      { id: 'depp_2', path: '/avatars/english_movies/depp_2.jpg', label: `Pirates of the Caribbean: On Stranger Tides` },
      { id: 'depp_3', path: '/avatars/english_movies/depp_3.jpg', label: `Alice in Wonderland` }
    ]
  },
  {
    name: 'Top Telugu Movies',
    options: [
      { id: 'prabhas_1', path: '/avatars/telugu_movies/prabhas_1.jpg', label: `Bāhubali 2: The Conclusion` },
      { id: 'prabhas_2', path: '/avatars/telugu_movies/prabhas_2.jpg', label: `Kalki 2898-AD` },
      { id: 'prabhas_3', path: '/avatars/telugu_movies/prabhas_3.jpg', label: `Bāhubali: The Beginning` },
      { id: 'mahesh_1', path: '/avatars/telugu_movies/mahesh_1.jpg', label: `Sarileru Neekevvaru` },
      { id: 'mahesh_2', path: '/avatars/telugu_movies/mahesh_2.jpg', label: `Bharat Ane Nenu` },
      { id: 'mahesh_3', path: '/avatars/telugu_movies/mahesh_3.jpg', label: `Maharshi` },
      { id: 'allu_1', path: '/avatars/telugu_movies/allu_1.jpg', label: `Pushpa 2 - The Rule` },
      { id: 'allu_2', path: '/avatars/telugu_movies/allu_2.jpg', label: `Pushpa: The Rise` },
      { id: 'allu_3', path: '/avatars/telugu_movies/allu_3.jpg', label: `Ala Vaikunthapurramuloo` },
      { id: 'ram_1', path: '/avatars/telugu_movies/ram_1.jpg', label: `RRR` },
      { id: 'ram_2', path: '/avatars/telugu_movies/ram_2.jpg', label: `Game Changer` },
      { id: 'ram_3', path: '/avatars/telugu_movies/ram_3.jpg', label: `Magadheera` },
      { id: 'ntr_1', path: '/avatars/telugu_movies/ntr_1.jpg', label: `RRR` },
      { id: 'ntr_2', path: '/avatars/telugu_movies/ntr_2.jpg', label: `Devara: Part 1` },
      { id: 'ntr_3', path: '/avatars/telugu_movies/ntr_3.jpg', label: `Oosaravelli` },
      { id: 'pawan_1', path: '/avatars/telugu_movies/pawan_1.jpg', label: `Gabbar Singh` },
      { id: 'pawan_2', path: '/avatars/telugu_movies/pawan_2.jpg', label: `Komaram Puli` },
      { id: 'pawan_3', path: '/avatars/telugu_movies/pawan_3.jpg', label: `Tholi Prema` }
    ]
  }
];
