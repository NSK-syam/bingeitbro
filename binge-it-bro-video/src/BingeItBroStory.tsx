import { AbsoluteFill } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/Unbounded";
import { loadFont as loadBody } from "@remotion/google-fonts/InstrumentSans";

const display = loadDisplay("normal", {
  weights: ["400", "600", "700"],
  subsets: ["latin"],
});

const body = loadBody("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin"],
});

const COLORS = {
  midnight: "#0B0B15",
  ink: "#151525",
  cream: "#F7F4EE",
  amber: "#FFB347",
  coral: "#FF6B6B",
  mint: "#A6FFCB",
  lilac: "#B4A8FF",
};

export const BingeItBroStory: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.midnight,
        fontFamily: body.fontFamily,
        color: COLORS.cream,
        overflow: "hidden",
      }}
    >
      {/* Atmospheric gradients */}
      <div
        style={{
          position: "absolute",
          inset: -200,
          background:
            "radial-gradient(circle at 20% 15%, rgba(180,168,255,0.35) 0%, transparent 55%)," +
            "radial-gradient(circle at 85% 10%, rgba(255,179,71,0.45) 0%, transparent 50%)," +
            "radial-gradient(circle at 50% 85%, rgba(255,107,107,0.35) 0%, transparent 60%)",
        }}
      />

      {/* Subtle mesh texture */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.18,
          backgroundImage:
            "linear-gradient(120deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 60%)," +
            "repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 6px)",
        }}
      />

      {/* Decorative rings */}
      <div
        style={{
          position: "absolute",
          top: -120,
          right: -160,
          width: 520,
          height: 520,
          borderRadius: "50%",
          border: "2px solid rgba(255,255,255,0.08)",
          boxShadow: "0 0 120px rgba(180,168,255,0.2)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -200,
          left: -140,
          width: 520,
          height: 520,
          borderRadius: "50%",
          border: "2px dashed rgba(255,255,255,0.08)",
        }}
      />

      <AbsoluteFill
        style={{
          padding: "80px 90px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 14,
              padding: "10px 18px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: 0.4,
            }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #B4A8FF, #FFB347)",
                display: "inline-block",
              }}
            />
            Binge It Bro
          </div>
          <div style={{ fontSize: 16, color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>
            bingeitbro.com
          </div>
        </div>

        {/* Main copy */}
        <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 760 }}>
          <div
            style={{
              fontFamily: display.fontFamily,
              fontSize: 92,
              fontWeight: 700,
              lineHeight: 1.02,
              letterSpacing: -1.5,
            }}
          >
            Pick the next movie
            <span
              style={{
                display: "block",
                color: "transparent",
                background: "linear-gradient(135deg, #B4A8FF 0%, #FFB347 55%, #FF6B6B 100%)",
                WebkitBackgroundClip: "text",
              }}
            >
              with your friends.
            </span>
          </div>
          <div
            style={{
              fontSize: 26,
              lineHeight: 1.45,
              color: "rgba(255,255,255,0.78)",
              fontWeight: 500,
            }}
          >
            BIB lets your circle share picks, vibe-check trailers, and decide what to watch in minutes.
          </div>

          {/* Social proof row */}
          <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
            <div style={{ display: "flex" }}>
              {["#FF6B6B", "#FFB347", "#B4A8FF", "#A6FFCB"].map((c, i) => (
                <div
                  key={c}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: c,
                    marginLeft: i === 0 ? 0 : -12,
                    border: "3px solid #0B0B15",
                  }}
                />
              ))}
            </div>
            <div
              style={{
                fontSize: 18,
                color: "rgba(255,255,255,0.7)",
                fontWeight: 600,
              }}
            >
              Your taste, curated by friends who actually get it.
            </div>
          </div>
        </div>

        {/* CTA */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            padding: "22px 28px",
            borderRadius: 26,
            boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
          }}
        >
          <div>
            <div style={{ fontSize: 18, color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>
              Join my BIB circle
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.4 }}>
              bingeitbro.com
            </div>
          </div>
          <div
            style={{
              padding: "16px 28px",
              borderRadius: 999,
              background: "linear-gradient(135deg, #B4A8FF, #FFB347)",
              color: "#101018",
              fontWeight: 700,
              fontSize: 20,
              letterSpacing: 0.6,
              textTransform: "uppercase",
            }}
          >
            Join now
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
