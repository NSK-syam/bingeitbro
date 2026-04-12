# Binge It Bro - Explainer Videos

Remotion-based explainer videos for the Binge It Bro app.

## Compositions

| Composition | Duration | Description |
|-------------|----------|-------------|
| **BingeItBro30** | 30 seconds | Full 5-scene explainer (Problem → Solution → How It Works → Why It Matters → CTA) |
| **BingeItBroExplainer** | ~22 seconds | Shorter 5-scene version |
| **BingeItBroStory** | 1 frame | Vertical story format (1080×1920) for social |

## Quick Start

```bash
# Install dependencies
npm install

# Open Remotion Studio (preview & edit)
npm start

# Render 30-second video
npm run build
# Output: out/video-30s.mp4

# Render shorter ~22s version
npm run build:short
# Output: out/video.mp4
```

## 30-Second Video Structure

1. **Scene 1 (Problem)** — "Too many shows. No real recommendations." — Streaming app icons, floating content cards
2. **Scene 2 (Solution)** — Binge It Bro logo + movie cards dashboard
3. **Scene 3 (How It Works)** — Find → Track → Share → Discover flow
4. **Scene 4 (Why It Matters)** — Friend recommendations, "Real people, not algorithms"
5. **Scene 5 (CTA)** — "Stop scrolling. Start watching." + bingeitbro.com

## Troubleshooting

If render fails with browser/Chrome errors, try:

```bash
# Use system Chrome instead of Headless Shell
npx remotion render src/index.ts BingeItBro30 out/video-30s.mp4 \
  --browser-executable="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

Or open Remotion Studio (`npm start`) and use the built-in render button.
