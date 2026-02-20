const fs = require('fs');
const data = JSON.parse(fs.readFileSync('themes-data.json', 'utf8'));

const english = data.filter(d => d.lang === 'English').slice(0, 20);
const telugu = data.filter(d => d.lang === 'Telugu').slice(0, 20);

function toThemeObj(d) {
  return `{
    id: '${d.id}',
    label: '${d.label.replace(/'/g, "\\'")}',
    bg: 'linear-gradient(160deg, rgba(4,8,16,0.6) 0%, rgba(4,8,16,0.95) 100%), url("${d.backdrop}") center/cover no-repeat',
    bubble: '${d.bubble}',
    bubbleBorder: '${d.bubbleBorder}',
  }`;
}

const out = `
export type ChatTheme = {
  id: string;
  label: string;
  bg: string;
  bubble: string;
  bubbleBorder: string;
  darkText?: boolean;
};

export const ENGLISH_THEMES: ChatTheme[] = [
  {
    id: 'default',
    label: 'Cinema Night',
    bg: 'linear-gradient(160deg, rgba(4,8,16,0.6) 0%, rgba(4,8,16,0.95) 100%), url("https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1280&auto=format&fit=crop") center/cover no-repeat',
    bubble: 'rgba(6,182,212,0.25)',
    bubbleBorder: 'rgba(103,232,249,0.45)',
  },
${english.map(toThemeObj).join(',\n')}
];

export const TELUGU_THEMES: ChatTheme[] = [
${telugu.map(toThemeObj).join(',\n')}
];
`;

fs.writeFileSync('src/lib/chat-themes.ts', out);
console.log('Created src/lib/chat-themes.ts');
