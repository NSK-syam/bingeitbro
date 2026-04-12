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
const MINT = "#34D399";
const SOFT_PINK = "#F472B6";

const STEPS = [
  { icon: "\uD83D\uDD0E", label: "Find", desc: "Search any movie or show", color: SOFT_PURPLE },
  { icon: "\uD83D\uDCCC", label: "Track", desc: "Add to your watchlist", color: WARM_ORANGE },
  { icon: "\u2B50", label: "Share", desc: "Rate and review it", color: "#FBBF24" },
  { icon: "\uD83D\uDCE9", label: "Discover", desc: "Send recs to friends", color: SOFT_PINK },
];

const StepItem: React.FC<{
  step: (typeof STEPS)[0];
  index: number;
  frame: number;
  fps: number;
}> = ({ step, index, frame, fps }) => {
  const enterSpring = spring({
    frame,
    fps,
    delay: 10 + index * 18,
    config: { damping: 20, stiffness: 80 },
  });

  const y = interpolate(enterSpring, [0, 1], [50, 0]);
  const opacity = enterSpring;

  // Subtle floating
  const floatY = Math.sin((frame + index * 30) * 0.03) * 2;

  // Gentle glow when entering
  const glowProgress = interpolate(
    frame,
    [10 + index * 18 + 15, 10 + index * 18 + 40],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        transform: `translateY(${y + floatY}px)`,
        opacity,
        width: 200,
      }}
    >
      {/* Icon container */}
      <div
        style={{
          width: 88,
          height: 88,
          borderRadius: 24,
          background: `${step.color}12`,
          border: `1.5px solid ${step.color}30`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 38,
          boxShadow: `0 0 ${glowProgress * 30}px ${step.color}20`,
        }}
      >
        {step.icon}
      </div>

      {/* Label */}
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: step.color,
          letterSpacing: 0.5,
        }}
      >
        {step.label}
      </div>

      {/* Description */}
      <div
        style={{
          fontSize: 14,
          color: "rgba(255,255,255,0.45)",
          fontWeight: 500,
          textAlign: "center",
          lineHeight: 1.4,
        }}
      >
        {step.desc}
      </div>
    </div>
  );
};

// Soft connecting line between steps
const Connector: React.FC<{
  index: number;
  frame: number;
  fps: number;
}> = ({ index, frame, fps }) => {
  const progress = interpolate(
    frame,
    [10 + index * 18 + 12, 10 + (index + 1) * 18 + 12],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) }
  );

  return (
    <div
      style={{
        width: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: 36,
      }}
    >
      {/* Dotted line */}
      <div style={{ display: "flex", gap: 6 }}>
        {[0, 1, 2, 3, 4].map((dot) => {
          const dotProgress = interpolate(
            progress,
            [dot * 0.2, dot * 0.2 + 0.2],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          return (
            <div
              key={dot}
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: `rgba(167,139,250,${dotProgress * 0.5})`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

export const Scene3HowItWorks: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Section header
  const headerProgress = interpolate(
    frame,
    [0, fps * 0.5],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) }
  );

  // Bottom tagline
  const taglineSpring = spring({
    frame,
    fps,
    delay: 90,
    config: { damping: 200 },
  });

  return (
    <AbsoluteFill style={{ backgroundColor: DARK_BG, overflow: "hidden" }}>
      {/* Soft grid dots in background */}
      <AbsoluteFill style={{ opacity: 0.03 }}>
        {Array.from({ length: 20 }).map((_, row) =>
          Array.from({ length: 35 }).map((_, col) => (
            <div
              key={`${row}-${col}`}
              style={{
                position: "absolute",
                left: col * 56 + 20,
                top: row * 56 + 20,
                width: 2,
                height: 2,
                borderRadius: 1,
                backgroundColor: "white",
              }}
            />
          ))
        )}
      </AbsoluteFill>

      {/* Accent glow */}
      <div
        style={{
          position: "absolute",
          top: "40%",
          left: "50%",
          marginLeft: -400,
          marginTop: -200,
          width: 800,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(167,139,250,0.06) 0%, transparent 60%)",
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
        {/* Section header */}
        <div
          style={{
            opacity: headerProgress,
            transform: `translateY(${interpolate(headerProgress, [0, 1], [10, 0])}px)`,
            fontSize: 13,
            fontWeight: 600,
            color: SOFT_PURPLE,
            letterSpacing: 3,
            textTransform: "uppercase",
            marginBottom: 48,
          }}
        >
          How It Works
        </div>

        {/* Steps row */}
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          {STEPS.map((step, i) => (
            <div key={step.label} style={{ display: "flex", alignItems: "flex-start" }}>
              <StepItem step={step} index={i} frame={frame} fps={fps} />
              {i < STEPS.length - 1 && (
                <Connector index={i} frame={frame} fps={fps} />
              )}
            </div>
          ))}
        </div>

        {/* Bottom tagline */}
        <div
          style={{
            marginTop: 56,
            opacity: taglineSpring,
            transform: `translateY(${interpolate(taglineSpring, [0, 1], [16, 0])}px)`,
            display: "flex",
            gap: 20,
            alignItems: "center",
          }}
        >
          {["Find", "Track", "Share", "Discover"].map((word, i) => (
            <div key={word} style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <span style={{ fontSize: 24, fontWeight: 700, color: STEPS[i].color }}>
                {word}
              </span>
              {i < 3 && (
                <span style={{ fontSize: 8, color: "rgba(255,255,255,0.2)" }}>{"\u25CF"}</span>
              )}
            </div>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
