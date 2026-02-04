import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cinema Chudu - Movie Recommendations from Friends",
  description:
    "Discover what to watch next with personalized movie and series recommendations from your friends. No algorithms, just genuine picks.",
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
    title: "Cinema Chudu",
    description: "Friends recommend, you watch",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} antialiased`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
