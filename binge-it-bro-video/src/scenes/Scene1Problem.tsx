import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  spring,
  Easing,
} from "remotion";

// Warm color palette
const CREAM = "#FFF8F0";
const WARM_ORANGE = "#F97316";
const SOFT_PURPLE = "#A78BFA";
const WARM_GRAY = "#6B7280";
const DARK_BG = "#111118";
const CARD_BG = "rgba(255,255,255,0.06)";

const STREAMING_APPS = [
  { name: "Netflix", abbr: "N", color: "#E50914" },
  { name: "Prime", abbr: "P", color: "#00A8E1" },
  { name: "Hulu", abbr: "H", color: "#1CE783" },
  { name: "Disney+", abbr: "D", color: "#113CCF" },
  { name: "HBO", abbr: "H", color: "#B535F6" },
  { name: "Apple", abbr: "A", color: "#A1A1A1" },
];

const SHOW_TITLES = [
  "Breaking Bad", "The Office", "Stranger Things", "Ted Lasso",
  "Succession", "Ozark", "Dark", "Fleabag",
  "Narcos", "Fargo", "Westworld", "Mindhunter",
];

// Floating card component for the background
const FloatingCard: React.FC<{
  title: string;
  index: number;
  frame: number;
  fps: number;
  totalCards: number;
}> = ({ title, index, frame, fps, totalCards }) => {
  // Stagger entrance
  const delay = index * 3;
  const enterProgress = interpolate(
    frame - delay,
    [0, fps * 0.8],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) }
  );

  // Gentle floating motion
  const floatY = Math.sin((frame + index * 20) * 0.03) * 4;
  const floatX = Math.cos((frame + index * 15) * 0.02) * 3;

  // Fade out towards end of scene
  const fadeOut = interpolate(frame, [fps * 3.5, fps * 4.5], [1, 0.3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Grid layout: 4 columns, 3 rows
  const col = index % 4;
  const row = Math.floor(index / 4);
  const baseX = 320 + col * 320;
  const baseY = 200 + row * 200;

  return (
    <div
      style={{
        position: "absolute",
        left: baseX + floatX,
        top: baseY + floatY,
        width: 260,
        height: 140,
        borderRadius: 16,
        background: CARD_BG,
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(10px)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 8,
        opacity: enterProgress * fadeOut,
        transform: `translateY(${interpolate(enterProgress, [0, 1], [30, 0])}px) scale(${interpolate(enterProgress, [0, 1], [0.9, 1])})`,
      }}
    >
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", fontWeight: 500, letterSpacing: 1, textTransform: "uppercase" }}>
        {index % 2 === 0 ? "TV Show" : "Movie"}
      </div>
      <div style={{ fontSize: 16, color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>
        {title}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <div
            key={star}
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: "rgba(255,255,255,0.15)",
            }}
          />
        ))}
      </div>
    </div>
  );
};

export const Scene1Problem: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Streaming app icons — gentle entrance
  const appsVisible = Math.min(STREAMING_APPS.length, Math.floor((frame / 5) + 1));

  // Main text animation - soft entrance
  const headlineProgress = interpolate(
    frame,
    [fps * 2, fps * 3],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) }
  );

  const subheadProgress = interpolate(
    frame,
    [fps * 2.8, fps * 3.8],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) }
  );

  // Soft warm glow that builds
  const glowOpacity = interpolate(frame, [fps * 2, fps * 4], [0, 0.12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: DARK_BG, overflow: "hidden" }}>
      {/* Subtle warm gradient in corner */}
      <div
        style={{
          position: "absolute",
          top: -200,
          right: -200,
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(249,115,22,0.06) 0%, transparent 70%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -200,
          left: -100,
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(167,139,250,0.05) 0%, transparent 70%)`,
        }}
      />

      {/* Floating content cards in background */}
      {SHOW_TITLES.map((title, i) => (
        <FloatingCard
          key={title}
          title={title}
          index={i}
          frame={frame}
          fps={fps}
          totalCards={SHOW_TITLES.length}
        />
      ))}

      {/* Center overlay gradient for readability */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at center, ${DARK_BG}ee 30%, ${DARK_BG}99 60%, transparent 100%)`,
        }}
      />

      {/* Center content */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Streaming app row */}
        <div style={{ display: "flex", gap: 16, marginBottom: 48 }}>
          {STREAMING_APPS.slice(0, appsVisible).map((app, i) => {
            const s = spring({
              frame: frame - i * 5,
              fps,
              config: { damping: 20, stiffness: 120 },
            });
            return (
              <div
                key={app.name}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: `${app.color}20`,
                  border: `1.5px solid ${app.color}40`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  fontWeight: 700,
                  color: `${app.color}cc`,
                  transform: `scale(${s})`,
                }}
              >
                {app.abbr}
              </div>
            );
          })}
        </div>

        {/* Headline */}
        <div
          style={{
            opacity: headlineProgress,
            transform: `translateY(${interpolate(headlineProgress, [0, 1], [20, 0])}px)`,
            fontSize: 52,
            fontWeight: 700,
            color: CREAM,
            letterSpacing: -1.5,
            textAlign: "center",
            lineHeight: 1.15,
          }}
        >
          Too many shows.
        </div>

        {/* Subheadline */}
        <div
          style={{
            opacity: subheadProgress,
            transform: `translateY(${interpolate(subheadProgress, [0, 1], [16, 0])}px)`,
            fontSize: 32,
            fontWeight: 500,
            color: WARM_ORANGE,
            letterSpacing: -0.5,
            textAlign: "center",
            marginTop: 12,
          }}
        >
          No real recommendations.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
