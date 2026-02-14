import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#f59e0b",
          borderRadius: 32,
          color: "#111111",
          display: "flex",
          fontSize: 64,
          fontWeight: 800,
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        BiB
      </div>
    ),
    { ...size }
  );
}
