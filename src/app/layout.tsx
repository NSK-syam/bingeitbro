import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components";
import { HelpBotWidget } from "@/components/HelpBotWidget";

// Local-first font stack so the build stays offline-safe without defaulting to generic system UI
const fontClass = "font-sans antialiased";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://bingeitbro.com";
const bingVerification = (process.env.NEXT_PUBLIC_BING_VERIFICATION || process.env.BING_VERIFICATION || "").trim();
const googleVerification = (process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || process.env.GOOGLE_SITE_VERIFICATION || "").trim();
const analyticsWebsiteId = (process.env.NEXT_PUBLIC_DATAFAST_WEBSITE_ID || process.env.DATAFAST_WEBSITE_ID || "").trim();
const analyticsDomain = (process.env.NEXT_PUBLIC_DATAFAST_DOMAIN || process.env.DATAFAST_DOMAIN || "").trim();
const adsensePublisherId = (process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID || process.env.ADSENSE_PUBLISHER_ID || "").trim();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: "/",
  },
  title: {
    default: "BiB - Binge it bro",
    template: "%s | BiB - Binge it bro",
  },
  applicationName: "BiB - Binge it bro",
  creator: "BiB",
  publisher: "BiB",
  referrer: "origin-when-cross-origin",
  description:
    "Discover what to watch next with personalized movie and series recommendations from your friends. Binge it bro.",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification: {
    ...(googleVerification ? { google: googleVerification } : {}),
    ...(bingVerification ? { other: { "msvalidate.01": bingVerification } } : {}),
  },
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
    description: "Find your next movie or show from friend recommendations in seconds. Save picks, skip endless scrolling, and binge smarter.",
    type: "website",
    url: "/",
    siteName: "BiB - Binge it bro",
    locale: "en_US",
    images: [
      {
        url: "/social-card-1200x630.jpg?v=20260215b",
        width: 1200,
        height: 630,
        alt: "BiB - Binge it bro",
        type: "image/jpeg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BiB - Binge it bro",
    description: "Find your next movie or show from friend recommendations in seconds.",
    images: [
      {
        url: "/social-card-1200x630.jpg?v=20260215b",
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
      <head>
        {analyticsWebsiteId && analyticsDomain ? (
          <script
            defer
            data-website-id={analyticsWebsiteId}
            data-domain={analyticsDomain}
            src="https://datafa.st/js/script.js"
          />
        ) : null}
        {adsensePublisherId ? (
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsensePublisherId}`}
            crossOrigin="anonymous"
          />
        ) : null}
      </head>
      <body className={fontClass}>
        <AuthProvider>
          {children}
          <HelpBotWidget />
        </AuthProvider>
      </body>
    </html>
  );
}
