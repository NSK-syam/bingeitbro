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
      { id: 'rdj_3', path: '/avatars/english_movies/rdj_3.jpg', label: `The Avengers` }
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
      { id: 'allu_3', path: '/avatars/telugu_movies/allu_3.jpg', label: `Ala Vaikunthapurramuloo` }
    ]
  },
  {
    name: 'Top English Series',
    options: [
      { id: 'english_series_0', path: '/avatars/english_series/a_knight_of_the_seve.jpg', label: `A Knight of the Seven Kingdoms` },
      { id: 'english_series_1', path: '/avatars/english_series/supernatural.jpg', label: `Supernatural` },
      { id: 'english_series_2', path: '/avatars/english_series/grey_s_anatomy.jpg', label: `Grey's Anatomy` },
      { id: 'english_series_3', path: '/avatars/english_series/the_simpsons.jpg', label: `The Simpsons` },
      { id: 'english_series_4', path: '/avatars/english_series/the_rookie.jpg', label: `The Rookie` },
      { id: 'english_series_5', path: '/avatars/english_series/family_guy.jpg', label: `Family Guy` },
      { id: 'english_series_6', path: '/avatars/english_series/stranger_things.jpg', label: `Stranger Things` },
      { id: 'english_series_7', path: '/avatars/english_series/law_order_special_vi.jpg', label: `Law & Order: Special Victims Unit` },
      { id: 'english_series_8', path: '/avatars/english_series/game_of_thrones.jpg', label: `Game of Thrones` },
      { id: 'english_series_9', path: '/avatars/english_series/ncis.jpg', label: `NCIS` }
    ]
  },
  {
    name: 'Top Telugu Series',
    options: [
      { id: 'telugu_series_0', path: '/avatars/telugu_series/amrutham.jpg', label: `Amrutham` },
      { id: 'telugu_series_1', path: '/avatars/telugu_series/dhoolpet_police_stat.jpg', label: `Dhoolpet Police Station` },
      { id: 'telugu_series_2', path: '/avatars/telugu_series/bigg_boss_telugu.jpg', label: `Bigg Boss Telugu` },
      { id: 'telugu_series_3', path: '/avatars/telugu_series/3_roses.jpg', label: `3 Roses` },
      { id: 'telugu_series_4', path: '/avatars/telugu_series/arabia_kadali.jpg', label: `Arabia Kadali` },
      { id: 'telugu_series_5', path: '/avatars/telugu_series/oka_chinna_family_st.jpg', label: `Oka Chinna Family Story` },
      { id: 'telugu_series_6', path: '/avatars/telugu_series/shaitan.jpg', label: `Shaitan` },
      { id: 'telugu_series_7', path: '/avatars/telugu_series/bujji_bhairava.jpg', label: `Bujji & Bhairava` },
      { id: 'telugu_series_8', path: '/avatars/telugu_series/brinda.jpg', label: `Brinda` },
      { id: 'telugu_series_9', path: '/avatars/telugu_series/dhahanam.jpg', label: `Dhahanam` }
    ]
  }
];
