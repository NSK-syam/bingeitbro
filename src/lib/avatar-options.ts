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
      { id: 'english_movies_0', path: '/avatars/english_movies/mercy.jpg', label: `Mercy` },
      { id: 'english_movies_1', path: '/avatars/english_movies/space_time.jpg', label: `Space/Time` },
      { id: 'english_movies_2', path: '/avatars/english_movies/28_years_later_the_b.jpg', label: `28 Years Later: The Bone Temple` },
      { id: 'english_movies_3', path: '/avatars/english_movies/greenland_2_migratio.jpg', label: `Greenland 2: Migration` },
      { id: 'english_movies_4', path: '/avatars/english_movies/deathstalker.jpg', label: `Deathstalker` },
      { id: 'english_movies_5', path: '/avatars/english_movies/zootopia_2.jpg', label: `Zootopia 2` },
      { id: 'english_movies_6', path: '/avatars/english_movies/the_wrecking_crew.jpg', label: `The Wrecking Crew` },
      { id: 'english_movies_7', path: '/avatars/english_movies/_wuthering_heights_.jpg', label: `“Wuthering Heights”` },
      { id: 'english_movies_8', path: '/avatars/english_movies/predator_badlands.jpg', label: `Predator: Badlands` },
      { id: 'english_movies_9', path: '/avatars/english_movies/the_housemaid.jpg', label: `The Housemaid` }
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
    name: 'Top Telugu Movies',
    options: [
      { id: 'telugu_movies_0', path: '/avatars/telugu_movies/b_hubali_the_epic.jpg', label: `Bāhubali: The Epic` },
      { id: 'telugu_movies_1', path: '/avatars/telugu_movies/laila.jpg', label: `Laila` },
      { id: 'telugu_movies_2', path: '/avatars/telugu_movies/the_rajasaab.jpg', label: `The Rajasaab` },
      { id: 'telugu_movies_3', path: '/avatars/telugu_movies/rrr.jpg', label: `RRR` },
      { id: 'telugu_movies_4', path: '/avatars/telugu_movies/v_ran_si.jpg', label: `Vāranāsi` },
      { id: 'telugu_movies_5', path: '/avatars/telugu_movies/devara_part_1.jpg', label: `Devara: Part 1` },
      { id: 'telugu_movies_6', path: '/avatars/telugu_movies/shivam.jpg', label: `Shivam` },
      { id: 'telugu_movies_7', path: '/avatars/telugu_movies/annayya.jpg', label: `Annayya` },
      { id: 'telugu_movies_8', path: '/avatars/telugu_movies/dragon.jpg', label: `Dragon` },
      { id: 'telugu_movies_9', path: '/avatars/telugu_movies/funky.jpg', label: `Funky` }
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
