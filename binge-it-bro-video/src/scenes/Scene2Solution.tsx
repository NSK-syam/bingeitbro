import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  spring,
  Easing,
} from "remotion";

const DARK_BG = "#111118";
const CREAM = "#FFF8F0";
const WARM_ORANGE = "#F97316";
const SOFT_PURPLE = "#A78BFA";

const MOCK_MOVIES = [
  { title: "Dune: Part Three", rating: 9.1, genre: "Sci-Fi", hue: 30 },
  { title: "The Bear S4", rating: 8.9, genre: "Drama", hue: 200 },
  { title: "Severance S3", rating: 9.3, genre: "Thriller", hue: 270 },
  { title: "Shogun S2", rating: 8.7, genre: "Historical", hue: 350 },
  { title: "Andor S2", rating: 9.0, genre: "Sci-Fi", hue: 160 },
];

const MovieCard: React.FC<{
  movie: (typeof MOCK_MOVIES)[0];
  index: number;
  frame: number;
  fps: number;
}> = ({ movie, index, frame, fps }) => {
  const enterSpring = spring({
    frame,
    fps,
    delay: 30 + index * 8,
    config: { damping: 20, stiffness: 100 },
  });

  const y = interpolate(enterSpring, [0, 1], [60, 0]);
  const opacity = enterSpring;

  // Gentle hover float
  const floatY = Math.sin((frame + index * 25) * 0.04) * 3;

  return (
    <div
      style={{
        width: 180,
        borderRadius: 16,
        overflow: "hidden",
        transform: `translateY(${y + floatY}px)`,
        opacity,
        flexShrink: 0,
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* Poster area */}
      <div
        style={{
          width: "100%",
          height: 220,
          background: `linear-gradient(160deg, hsl(${movie.hue}, 30%, 18%), hsl(${movie.hue}, 20%, 10%))`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <div style={{ fontSize: 40, opacity: 0.6 }}>
          {index % 2 === 0 ? "\uD83C\uDFAC" : "\uD83D\uDCFA"}
        </div>
        {/* Rating badge */}
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            background: "rgba(0,0,0,0.5)",
            borderRadius: 8,
            padding: "4px 8px",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span style={{ fontSize: 11, color: "#fbbf24" }}>{"\u2605"}</span>
          <span style={{ fontSize: 12, color: CREAM, fontWeight: 600 }}>
            {movie.rating}
          </span>
        </div>
      </div>
      {/* Info */}
      <div style={{ padding: "14px 16px" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: CREAM, lineHeight: 1.3, marginBottom: 6 }}>
          {movie.title}
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>
          {movie.genre}
        </div>
      </div>
    </div>
  );
};

export const Scene2Solution: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo entrance — soft spring
  const logoSpring = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 80 },
  });

  // Tagline
  const tagProgress = interpolate(
    frame,
    [fps * 1, fps * 1.8],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: DARK_BG, overflow: "hidden" }}>
      {/* Warm accent blobs */}
      <div
        style={{
          position: "absolute",
          top: -100,
          left: "50%",
          marginLeft: -300,
          width: 600,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(167,139,250,0.08) 0%, transparent 70%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -150,
          right: -100,
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(249,115,22,0.06) 0%, transparent 70%)",
        }}
      />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Logo row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 12,
            opacity: logoSpring,
            transform: `scale(${interpolate(logoSpring, [0, 1], [0.8, 1])})`,
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: `linear-gradient(135deg, ${SOFT_PURPLE}, ${WARM_ORANGE})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
            }}
          >
            {"\uD83C\uDF7F"}
          </div>
          <div
            style={{
              fontSize: 44,
              fontWeight: 800,
              color: CREAM,
              letterSpacing: -1.5,
            }}
          >
            Binge It Bro
          </div>
        </div>

        {/* Tagline */}
        <div
          style={{
            opacity: tagProgress,
            transform: `translateY(${interpolate(tagProgress, [0, 1], [12, 0])}px)`,
            fontSize: 20,
            color: "rgba(255,255,255,0.55)",
            fontWeight: 500,
            marginBottom: 48,
            textAlign: "center",
            letterSpacing: 0.3,
          }}
        >
          One place to track, rate, and share what you watch.
        </div>

        {/* Movie cards — floating dashboard */}
        <div
          style={{
            display: "flex",
            gap: 20,
            justifyContent: "center",
          }}
        >
          {MOCK_MOVIES.map((movie, i) => (
            <MovieCard
              key={movie.title}
              movie={movie}
              index={i}
              frame={frame}
              fps={fps}
            />
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
