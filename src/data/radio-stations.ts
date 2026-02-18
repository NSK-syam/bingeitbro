export type RadioStation = {
  id: string;
  name: string;
  genre: string;
  country: string;
  language: string;
  bitrate: string;
  streamUrl: string;
  websiteUrl: string;
  description: string;
};

export const RADIO_STATIONS: RadioStation[] = [
  {
    id: 'groove-salad',
    name: 'SomaFM Groove Salad',
    genre: 'Ambient',
    country: 'United States',
    language: 'English',
    bitrate: '128 kbps',
    streamUrl: 'https://ice1.somafm.com/groovesalad-128-mp3',
    websiteUrl: 'https://somafm.com/groovesalad/',
    description: 'Chilled ambient and downtempo for deep focus or relaxed evenings.',
  },
  {
    id: 'indie-pop-rocks',
    name: 'SomaFM Indie Pop Rocks',
    genre: 'Indie',
    country: 'United States',
    language: 'English',
    bitrate: '128 kbps',
    streamUrl: 'https://ice1.somafm.com/indiepop-128-mp3',
    websiteUrl: 'https://somafm.com/indiepop/',
    description: 'A steady stream of modern indie pop and guitar-heavy discoveries.',
  },
  {
    id: 'secret-agent',
    name: 'SomaFM Secret Agent',
    genre: 'Electronic',
    country: 'United States',
    language: 'English',
    bitrate: '128 kbps',
    streamUrl: 'https://ice1.somafm.com/secretagent-128-mp3',
    websiteUrl: 'https://somafm.com/secretagent/',
    description: 'Spy jazz, cinematic rhythms, and stylish soundtrack energy.',
  },
  {
    id: 'drone-zone',
    name: 'SomaFM Drone Zone',
    genre: 'Ambient',
    country: 'United States',
    language: 'English',
    bitrate: '128 kbps',
    streamUrl: 'https://ice1.somafm.com/dronezone-128-mp3',
    websiteUrl: 'https://somafm.com/dronezone/',
    description: 'Slow-moving atmospheric textures for calm listening sessions.',
  },
  {
    id: 'nts-1',
    name: 'NTS Radio 1',
    genre: 'Mixed',
    country: 'United Kingdom',
    language: 'English',
    bitrate: '128 kbps',
    streamUrl: 'https://stream-relay-geo.ntslive.net/stream',
    websiteUrl: 'https://www.nts.live/',
    description: 'Global DJ sets, curated shows, and eclectic underground selections.',
  },
  {
    id: 'nts-2',
    name: 'NTS Radio 2',
    genre: 'Mixed',
    country: 'United Kingdom',
    language: 'English',
    bitrate: '128 kbps',
    streamUrl: 'https://stream-relay-geo.ntslive.net/stream2',
    websiteUrl: 'https://www.nts.live/',
    description: 'Alternative channel with experimental sets and deep catalog programming.',
  },
  {
    id: 'kexp',
    name: 'KEXP 90.3 FM',
    genre: 'Alternative',
    country: 'United States',
    language: 'English',
    bitrate: '128 kbps',
    streamUrl: 'https://kexp.streamguys1.com/kexp128.mp3',
    websiteUrl: 'https://www.kexp.org/',
    description: 'Independent radio featuring alternative, rock, and artist sessions.',
  },
  {
    id: 'jazz24',
    name: 'Jazz24',
    genre: 'Jazz',
    country: 'United States',
    language: 'English',
    bitrate: '128 kbps',
    streamUrl: 'https://knkx-live-a.edge.audiocdn.com/6285_128k?aw_0_1st.playerid=jazz24.org',
    websiteUrl: 'https://www.jazz24.org/',
    description: 'Straight-ahead jazz, contemporary sets, and timeless classics.',
  },
];
