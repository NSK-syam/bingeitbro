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
  { emoji: '🎬', label: 'Clapper' },
  { emoji: '🎭', label: 'Theater' },
  { emoji: '🎪', label: 'Circus' },
  { emoji: '🎯', label: 'Target' },
  { emoji: '📽️', label: 'Projector' },
  { emoji: '🎞️', label: 'Film' },
  { emoji: '📼', label: 'VHS' },
  { emoji: '🎥', label: 'Movie camera' },
];

/** Snacks & watch vibes */
const SNACKS_AND_VIBES: AvatarOption[] = [
  { emoji: '🍿', label: 'Popcorn' },
  { emoji: '🥤', label: 'Drink' },
  { emoji: '🍫', label: 'Chocolate' },
  { emoji: '🍕', label: 'Pizza' },
  { emoji: '🛋️', label: 'Couch' },
  { emoji: '🌙', label: 'Night' },
  { emoji: '⭐', label: 'Star' },
  { emoji: '🌟', label: 'Glow' },
];

/** Music & drama */
const MUSIC_AND_DRAMA: AvatarOption[] = [
  { emoji: '🎸', label: 'Guitar' },
  { emoji: '🎹', label: 'Piano' },
  { emoji: '🎤', label: 'Mic' },
  { emoji: '🎧', label: 'Headphones' },
  { emoji: '🎵', label: 'Music' },
  { emoji: '🎶', label: 'Notes' },
  { emoji: '🎺', label: 'Trumpet' },
  { emoji: '🎻', label: 'Violin' },
];

/** Fun & celebration */
const FUN_AND_CELEBRATION: AvatarOption[] = [
  { emoji: '🎉', label: 'Party' },
  { emoji: '🎊', label: 'Confetti' },
  { emoji: '🎲', label: 'Dice' },
  { emoji: '🔥', label: 'Fire' },
  { emoji: '💫', label: 'Dizzy' },
  { emoji: '✨', label: 'Sparkle' },
  { emoji: '🌈', label: 'Rainbow' },
  { emoji: '🎁', label: 'Gift' },
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
