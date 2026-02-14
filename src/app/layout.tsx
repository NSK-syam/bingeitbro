import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components";

// System font stack so build works without network (no Google Fonts fetch)
const fontClass = "font-sans antialiased";

export const metadata: Metadata = {
  metadataBase: new URL("https://bingeitbro.com"),
  title: {
    default: "BiB - Binge it bro",
    template: "%s | BiB - Binge it bro",
  },
  applicationName: "BiB - Binge it bro",
  description:
    "Discover what to watch next with personalized movie and series recommendations from your friends. Binge it bro.",
  icons: {
    // Make icon candidates explicit for crawlers (Google requires multiples of 48px).
    icon: [
      { url: "/icon", type: "image/png", sizes: "192x192" },
      { url: "/favicon.ico", type: "image/x-icon" },
    ],
    shortcut: "/icon",
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  },
  keywords: [
    "movies",
    "recommendations",
    "Telugu movies",
    "OTT",
    "Netflix",
    "Prime Video",
    "what to watch",
  ],
  openGraph: {
    title: "BiB - Binge it bro",
    description: "Friends recommend, you watch",
    type: "website",
    images: [
      {
        url: "/og-bib.svg",
        width: 1200,
        height: 630,
        alt: "BiB - Binge it bro",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={fontClass}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
