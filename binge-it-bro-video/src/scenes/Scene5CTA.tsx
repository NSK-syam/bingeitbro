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

export const Scene5CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // CTA text entrance
  const ctaProgress = interpolate(
    frame,
    [5, fps * 1],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) }
  );

  const cta2Progress = interpolate(
    frame,
    [fps * 0.6, fps * 1.4],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) }
  );

  // Logo
  const logoSpring = spring({
    frame,
    fps,
    delay: Math.floor(fps * 1.2),
    config: { damping: 20, stiffness: 80 },
  });

  // URL bar
  const urlSpring = spring({
    frame,
    fps,
    delay: Math.floor(fps * 2),
    config: { damping: 20, stiffness: 80 },
  });

  // Tagline
  const taglineProgress = interpolate(
    frame,
    [fps * 3, fps * 3.8],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) }
  );

  // Gentle pulsing glow
  const glowPhase = interpolate(
    frame % (fps * 3),
    [0, fps * 1.5, fps * 3],
    [0.04, 0.1, 0.04],
    { extrapolateRight: "clamp" }
  );

  // Soft floating particles
  const particles = Array.from({ length: 16 }).map((_, i) => {
    const angle = (i / 16) * Math.PI * 2;
    const radius = 250 + Math.sin(i * 2.3) * 100;
    const speed = 0.012 + (i % 4) * 0.003;
    const x = Math.cos(angle + frame * speed) * radius;
    const y = Math.sin(angle + frame * speed) * radius * 0.6;
    const size = 3 + (i % 3) * 2;
    const particleOpacity = interpolate(
      frame,
      [10, 40],
      [0, 0.15 + (i % 3) * 0.05],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );

    return (
      <div
        key={i}
        style={{
          position: "absolute",
          top: `calc(50% + ${y}px)`,
          left: `calc(50% + ${x}px)`,
          width: size,
          height: size,
          borderRadius: "50%",
          backgroundColor: i % 2 === 0 ? SOFT_PURPLE : WARM_ORANGE,
          opacity: particleOpacity,
        }}
      />
    );
  });

  return (
    <AbsoluteFill style={{ backgroundColor: DARK_BG, overflow: "hidden" }}>
      {/* Centered glow */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          marginTop: -300,
          marginLeft: -400,
          width: 800,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(167,139,250,${glowPhase}) 0%, rgba(249,115,22,${glowPhase * 0.4}) 40%, transparent 70%)`,
        }}
      />

      {/* Particles */}
      {particles}

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* CTA headline */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div
            style={{
              opacity: ctaProgress,
              transform: `translateY(${interpolate(ctaProgress, [0, 1], [20, 0])}px)`,
              fontSize: 52,
              fontWeight: 700,
              color: CREAM,
              letterSpacing: -1.5,
              lineHeight: 1.2,
            }}
          >
            Stop scrolling.
          </div>
          <div
            style={{
              opacity: cta2Progress,
              transform: `translateY(${interpolate(cta2Progress, [0, 1], [16, 0])}px)`,
              fontSize: 52,
              fontWeight: 700,
              letterSpacing: -1.5,
              lineHeight: 1.2,
              marginTop: 4,
              background: `linear-gradient(135deg, ${SOFT_PURPLE}, ${WARM_ORANGE})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Start watching.
          </div>
        </div>

        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 28,
            opacity: logoSpring,
            transform: `scale(${interpolate(logoSpring, [0, 1], [0.85, 1])})`,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: `linear-gradient(135deg, ${SOFT_PURPLE}, ${WARM_ORANGE})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 30,
            }}
          >
            {"\uD83C\uDF7F"}
          </div>
          <div
            style={{
              fontSize: 48,
              fontWeight: 800,
              color: CREAM,
              letterSpacing: -1.5,
            }}
          >
            Binge It Bro
          </div>
        </div>

        {/* URL pill */}
        <div
          style={{
            opacity: urlSpring,
            transform: `translateY(${interpolate(urlSpring, [0, 1], [16, 0])}px) scale(${interpolate(urlSpring, [0, 1], [0.9, 1])})`,
            background: "rgba(255,255,255,0.06)",
            borderRadius: 50,
            padding: "14px 32px",
            border: "1px solid rgba(255,255,255,0.1)",
            marginBottom: 32,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: "#34D399",
            }}
          />
          <span
            style={{
              fontSize: 20,
              color: "rgba(255,255,255,0.8)",
              fontWeight: 600,
              letterSpacing: 0.5,
            }}
          >
            bingeitbro.com
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            opacity: taglineProgress,
            transform: `translateY(${interpolate(taglineProgress, [0, 1], [10, 0])}px)`,
            fontSize: 18,
            color: "rgba(255,255,255,0.4)",
            fontWeight: 500,
            fontStyle: "italic",
            letterSpacing: 0.5,
          }}
        >
          Trust your friends' taste.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
