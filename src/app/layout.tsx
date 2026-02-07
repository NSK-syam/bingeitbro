import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components";

// System font stack so build works without network (no Google Fonts fetch)
const fontClass = "font-sans antialiased";

export const metadata: Metadata = {
  title: "BiB - Binge it bro",
  description:
    "Discover what to watch next with personalized movie and series recommendations from your friends. Binge it bro.",
  icons: {
    icon: "/bib-icon.svg",
    shortcut: "/bib-icon.svg",
    apple: "/bib-icon.svg",
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
