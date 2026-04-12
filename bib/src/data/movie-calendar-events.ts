export type MovieCalendarEvent = {
  id: string;
  monthDay: string; // MM-DD
  title: string;
  subtitle: string;
  description: string;
  movieSearchQuery: string;
  showSearchQuery?: string;
  showAllDay?: boolean;
  quotes?: string[];
};

export const MOVIE_CALENDAR_EVENTS: MovieCalendarEvent[] = [
  {
    id: 'new-year-cinema',
    monthDay: '01-01',
    title: 'New Year Movie Marathon',
    subtitle: 'Fresh year. Fresh watchlist.',
    description: 'Kick off the year with uplifting and crowd-favorite films.',
    movieSearchQuery: 'new year celebration movie',
    showSearchQuery: 'new year celebration series',
  },
  {
    id: 'valentines-day',
    monthDay: '02-14',
    title: "Valentine's Day Movie Picks",
    subtitle: 'Romance night is here.',
    description: 'Today is perfect for romantic favorites and comfort watches.',
    movieSearchQuery: 'romantic love movie',
    showSearchQuery: 'romantic love series',
    showAllDay: true,
    quotes: [
      "You had me at hello.",
      "I'm also just a girl, standing in front of a boy, asking him to love her.",
      "To me, you are perfect.",
      "It was a million tiny little things that, when you added them all up, they meant we were supposed to be together.",
      "The best love is the kind that awakens the soul.",
    ],
  },
  {
    id: 'star-wars-day',
    monthDay: '05-04',
    title: 'Star Wars Day Picks',
    subtitle: 'May the Fourth be with you.',
    description: 'A special sci-fi day for galaxy-scale adventures.',
    movieSearchQuery: 'star wars sci fi movie',
    showSearchQuery: 'star wars sci fi series',
  },
  {
    id: 'friendship-day-watch',
    monthDay: '07-30',
    title: 'Friendship Day Watchlist',
    subtitle: 'Watch with your crew.',
    description: 'Celebrate friendship with buddy movies and feel-good stories.',
    movieSearchQuery: 'friendship buddy movie',
    showSearchQuery: 'friendship comedy series',
  },
  {
    id: 'animation-day',
    monthDay: '10-28',
    title: 'International Animation Day',
    subtitle: 'Animated worlds, big emotions.',
    description: 'Today is all about stunning animation and iconic characters.',
    movieSearchQuery: 'best animated movies',
    showSearchQuery: 'best animated series',
  },
  {
    id: 'halloween-night',
    monthDay: '10-31',
    title: 'Halloween Movie Night',
    subtitle: 'Horror, thrill, and chills.',
    description: 'Spooky season spotlight: horror and dark thrillers for tonight.',
    movieSearchQuery: 'halloween horror movie',
    showSearchQuery: 'halloween horror series',
  },
  {
    id: 'christmas-watch',
    monthDay: '12-25',
    title: 'Christmas Cinema Special',
    subtitle: 'Festive picks for today.',
    description: 'Warm holiday classics and joyful movies for Christmas.',
    movieSearchQuery: 'christmas holiday movie',
    showSearchQuery: 'christmas holiday series',
  },
];
