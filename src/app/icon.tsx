import { ImageResponse } from "next/og";

export const size = {
  width: 192,
  height: 192,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#f59e0b",
          borderRadius: 28,
          color: "#111111",
          display: "flex",
          fontSize: 72,
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
