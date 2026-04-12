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
const SOFT_PINK = "#F472B6";
const MINT = "#34D399";

const FRIENDS = [
  {
    name: "Alex",
    avatar: "\uD83D\uDE04",
    message: "You HAVE to watch Severance!",
    color: "#60A5FA",
    reaction: "\uD83D\uDD25",
  },
  {
    name: "Maya",
    avatar: "\uD83E\uDD29",
    message: "Dune Part Three was insane!",
    color: SOFT_PINK,
    reaction: "\uD83D\uDE4C",
  },
  {
    name: "Jay",
    avatar: "\uD83D\uDE0E",
    message: "Added to my watchlist!",
    color: MINT,
    reaction: "\u2764\uFE0F",
  },
];

const MessageBubble: React.FC<{
  friend: (typeof FRIENDS)[0];
  index: number;
  frame: number;
  fps: number;
}> = ({ friend, index, frame, fps }) => {
  const enterSpring = spring({
    frame,
    fps,
    delay: 8 + index * 22,
    config: { damping: 20, stiffness: 80 },
  });

  const x = interpolate(enterSpring, [0, 1], [index % 2 === 0 ? -60 : 60, 0]);
  const opacity = enterSpring;

  // Reaction pop
  const reactionSpring = spring({
    frame,
    fps,
    delay: 8 + index * 22 + 18,
    config: { damping: 10, stiffness: 150 },
  });

  // Gentle float
  const floatY = Math.sin((frame + index * 20) * 0.025) * 2;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        opacity,
        transform: `translateX(${x}px) translateY(${floatY}px)`,
        marginBottom: 20,
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 16,
          background: `${friend.color}15`,
          border: `1.5px solid ${friend.color}30`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 26,
          flexShrink: 0,
        }}
      >
        {friend.avatar}
      </div>

      {/* Message */}
      <div
        style={{
          background: "rgba(255,255,255,0.05)",
          borderRadius: 20,
          borderTopLeftRadius: 6,
          padding: "16px 24px",
          border: "1px solid rgba(255,255,255,0.07)",
          maxWidth: 380,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: friend.color, marginBottom: 6, letterSpacing: 0.3 }}>
          {friend.name}
        </div>
        <div style={{ fontSize: 17, color: CREAM, fontWeight: 500, lineHeight: 1.4, opacity: 0.9 }}>
          {friend.message}
        </div>
      </div>

      {/* Reaction */}
      <div
        style={{
          fontSize: 28,
          transform: `scale(${reactionSpring})`,
          opacity: reactionSpring,
        }}
      >
        {friend.reaction}
      </div>
    </div>
  );
};

export const Scene4WhyItMatters: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Bottom text
  const textProgress = interpolate(
    frame,
    [fps * 3, fps * 4],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: DARK_BG, overflow: "hidden" }}>
      {/* Warm glow accents */}
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: "40%",
          width: 600,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(244,114,182,0.05) 0%, transparent 60%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 0,
          right: "20%",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(167,139,250,0.04) 0%, transparent 60%)",
        }}
      />

      {/* Subtle connecting lines */}
      <AbsoluteFill style={{ opacity: 0.04 }}>
        {Array.from({ length: 8 }).map((_, i) => {
          const lineProgress = interpolate(
            frame,
            [i * 8, i * 8 + 40],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                top: `${20 + i * 10}%`,
                left: "10%",
                width: `${lineProgress * 80}%`,
                height: 1,
                background: `linear-gradient(90deg, transparent, rgba(167,139,250,0.3), transparent)`,
              }}
            />
          );
        })}
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 200px",
        }}
      >
        {/* Friend messages */}
        <div style={{ marginBottom: 40 }}>
          {FRIENDS.map((friend, i) => (
            <MessageBubble
              key={friend.name}
              friend={friend}
              index={i}
              frame={frame}
              fps={fps}
            />
          ))}
        </div>

        {/* Bottom text */}
        <div
          style={{
            opacity: textProgress,
            transform: `translateY(${interpolate(textProgress, [0, 1], [16, 0])}px)`,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 36, fontWeight: 700, color: CREAM, letterSpacing: -0.5, lineHeight: 1.3 }}>
            Real recommendations from{" "}
            <span
              style={{
                background: `linear-gradient(135deg, ${SOFT_PURPLE}, ${WARM_ORANGE})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              real people
            </span>
          </div>
          <div style={{ fontSize: 18, color: "rgba(255,255,255,0.4)", fontWeight: 500, marginTop: 10 }}>
            {"\u2014"} not algorithms.
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
